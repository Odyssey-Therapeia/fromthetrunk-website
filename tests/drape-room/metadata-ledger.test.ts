import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "drizzle/0028_ai_tryon_metadata.sql"),
  "utf8",
);
const referenceMigration = readFileSync(
  join(root, "drizzle/0029_ai_tryon_reference_metadata.sql"),
  "utf8",
);
const budgetService = readFileSync(
  join(root, "lib/drape-room/ledger/budget.ts"),
  "utf8",
);
const drizzleSchema = readFileSync(join(root, "db/schema.ts"), "utf8");

function createTableBody(table: string): string {
  const match = migration.match(
    new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`),
  );
  if (!match?.[1]) throw new Error(`Missing ${table} in migration`);
  return match[1];
}

describe("Drape Room metadata-only ledger migration", () => {
  it("contains no customer or generated image persistence columns", () => {
    const requestColumns = createTableBody("ai_tryon_requests");

    for (const prohibitedColumn of [
      "image",
      "blob",
      "base64",
      "filename",
      "photo_digest",
      "prompt",
      "notes",
      "raw_ip",
      "user_agent",
      "provider_request",
      "provider_response",
    ]) {
      expect(requestColumns.toLowerCase()).not.toContain(
        `"${prohibitedColumn}"`,
      );
    }
    expect(requestColumns).not.toMatch(/\b(bytea|jsonb?)\b/i);
  });

  it("claims idempotency and budget under the same locked reservation function", () => {
    expect(migration).toContain('FUNCTION "public"."ftt_ai_tryon_reserve"');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain(
      "v_settled + v_reserved + p_forecast_micro_usd > v_limit",
    );
    expect(migration).toContain('ON CONFLICT ("idempotency_hash") DO NOTHING');
    expect(migration).toContain("RETURN QUERY SELECT 'duplicate'::text");
    expect(migration).not.toContain("p_product_id");
    expect(migration).toContain(
      '"request_id", "idempotency_hash", "session_tag", "budget_period",\n    "background"',
    );
    expect(migration).toContain(
      "p_request_id, p_idempotency_hash, p_session_tag, p_period",
    );
  });

  it("settles the exact period reserved instead of recomputing it from a clock", () => {
    const requestColumns = createTableBody("ai_tryon_requests");
    expect(requestColumns).toContain('"budget_period" text NOT NULL');
    expect(requestColumns).toContain(
      'CONSTRAINT "ai_tryon_requests_budget_period_format"',
    );
    expect(migration).toContain(
      'SELECT "budget_period"\n    INTO v_period',
    );
    expect(migration).not.toContain(
      'to_char("created_at" AT TIME ZONE \'UTC\', \'YYYY-MM\')',
    );
  });

  it("settles ambiguous and post-provider outcomes conservatively", () => {
    expect(migration).toContain("'ambiguous_provider'");
    expect(migration).toContain("'failed_post_provider'");
    expect(migration).toContain(
      "WHEN p_actual_micro_usd IS NULL THEN v_reserved",
    );
    expect(migration).toContain(
      "WHEN p_status = 'failed_pre_provider' THEN 0",
    );
  });

  it("reconciles stale reservations without retrying or deleting idempotency", () => {
    expect(migration).toContain(
      'FUNCTION "public"."ftt_ai_tryon_reconcile_stale"',
    );
    expect(migration).toContain("INTERVAL '10 minutes'");
    expect(migration).toContain(
      "THEN 'failed_pre_provider'::\"public\".\"ai_tryon_request_status\"",
    );
    expect(migration).toContain(
      "ELSE 'ambiguous_provider'::\"public\".\"ai_tryon_request_status\"",
    );
    expect(migration).toContain(
      "WHEN stale.\"status\" = 'reserved' THEN 0",
    );
    expect(migration).toContain("ELSE stale.\"reserved_micro_usd\"");
    expect(migration).toContain("ELSE 'PROVIDER_TIMEOUT'");
    expect(migration).toContain(
      'PERFORM "public"."ftt_ai_tryon_reconcile_stale"(v_existing_period)',
    );
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"public"\."ai_tryon_requests"/i);
  });

  it("uses one bucket-then-request lock order for reconciliation and finalization", () => {
    const finalize = migration.slice(
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_finalize"'),
    );
    expect(finalize.indexOf('FROM "public"."ai_tryon_budget_buckets"')).toBeLessThan(
      finalize.indexOf('AND "budget_period" = v_period\n    FOR UPDATE'),
    );
    expect(migration).toContain(
      '"ai_tryon_requests_budget_status_created_idx"',
    );
  });

  it("runs stale reconciliation independently of customer traffic", () => {
    expect(budgetService).toContain("reconcileStaleTryonBudgets");
    expect(budgetService).toContain("ftt_ai_tryon_reconcile_stale");
    expect(budgetService).toContain("INTERVAL '10 minutes'");
    const candidateQuery = budgetService.match(
      /SELECT DISTINCT budget_period[\s\S]*?LIMIT 24/,
    )?.[0];
    expect(candidateQuery).toBeDefined();
    expect(candidateQuery).not.toMatch(/image|photo|prompt/i);
  });

  it("adds nullable, all-or-none reference metadata for legacy-safe rollout", () => {
    for (const column of [
      "reference_contract_version",
      "product_reference_version",
      "reference_mode",
      "reference_count",
    ]) {
      expect(referenceMigration).toContain(`ADD COLUMN "${column}"`);
      expect(referenceMigration).not.toMatch(
        new RegExp(`ADD COLUMN "${column}"[^,;]*NOT NULL`),
      );
    }
    expect(referenceMigration).toContain(
      'CONSTRAINT "ai_tryon_requests_reference_metadata_consistent"',
    );
    expect(referenceMigration).toContain(
      '"reference_contract_version" = \'gallery-v2\'',
    );
    for (const column of [
      "reference_contract_version",
      "product_reference_version",
      "reference_mode",
      "reference_count",
    ]) {
      expect(referenceMigration).toContain(`"${column}" IS NOT NULL`);
    }
    expect(referenceMigration).toContain(
      '("reference_mode" = \'single\' AND "reference_count" = 2)',
    );
    expect(referenceMigration).toContain(
      '("reference_mode" = \'dual\' AND "reference_count" = 3)',
    );
    expect(drizzleSchema).toContain(
      'referenceContractVersion: text("reference_contract_version")',
    );
    expect(drizzleSchema).toContain(
      'referenceMetadataConsistent: check(',
    );
  });

  it("binds the complete reference identity before dispatch accounting", () => {
    expect(budgetService).toContain(
      "SET product_id = ${input.productId}::uuid,",
    );
    for (const column of [
      "reference_contract_version",
      "product_reference_version",
      "reference_mode",
      "reference_count",
    ]) {
      expect(budgetService).toContain(`${column} =`);
      expect(budgetService).toContain(`${column} IS NOT NULL`);
    }
    expect(budgetService.indexOf("reference_count = ${input.referenceCount}"))
      .toBeLessThan(budgetService.indexOf("SET status = 'in_progress'"));
  });
});

/**
 * 0029 is applied by hand (see docs/operations/drape-room-release.md), so the
 * file itself is the review surface. These assertions make its scope explicit:
 * exactly four new columns, and none of the prohibited content classes.
 */
describe("Drape Room reference-metadata migration 0029", () => {
  it("adds exactly four columns and nothing else", () => {
    const addColumns = referenceMigration.match(/ADD COLUMN "/g) ?? [];

    expect(addColumns).toHaveLength(4);
    // A fifth column (e.g. photo_digest, provider_response) would slip past the
    // per-column assertions above, which only check that each expected one exists.
    expect(referenceMigration).not.toMatch(/DROP COLUMN/i);
    expect(referenceMigration).not.toMatch(/CREATE TABLE/i);
  });

  it("stores no image, prompt, provider payload, or raw network identity", () => {
    for (const prohibited of [
      "image",
      "photo",
      "blob",
      "base64",
      "bytea",
      "filename",
      "prompt",
      "notes",
      "raw_ip",
      "ip_address",
      "user_agent",
      "provider_request",
      "provider_response",
    ]) {
      expect(referenceMigration.toLowerCase()).not.toContain(prohibited);
    }
  });

  it("touches only ai_tryon_requests, never the optional media subsystem", () => {
    expect(referenceMigration).toContain('ALTER TABLE "ai_tryon_requests"');
    // 0029 must stay independent of 0027 so Drape Room can ship without it.
    expect(referenceMigration.toLowerCase()).not.toContain("media_derivative");
    expect(referenceMigration.toLowerCase()).not.toContain("media_asset");
  });
});

/**
 * `pnpm db:migrate` (drizzle-kit) applies only migrations registered in the
 * journal. The journal stops at 0009, so every later file — including the two
 * Drape Room migrations — is applied by hand instead. That divergence is
 * documented in the release runbook, but prose does not fail a build: this test
 * makes the standalone set explicit, so adding a new .sql file without either
 * registering it or declaring it here fails loudly.
 */
describe("Drizzle migration journal divergence", () => {
  const journal = JSON.parse(
    readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };

  it("still stops at 0009, so db:migrate cannot be assumed to apply 0028/0029", () => {
    const tags = journal.entries.map((entry) => entry.tag);

    expect(tags).not.toContain("0028_ai_tryon_metadata");
    expect(tags).not.toContain("0029_ai_tryon_reference_metadata");
    // If this ever fails, the journal has been backfilled — update
    // docs/operations/drape-room-release.md, which currently instructs
    // operators to apply the Drape Room SQL manually with psql.
    expect(tags.at(-1)).toBe("0009_tags");
  });

  it("keeps the manual-application requirement documented in the runbook", () => {
    const runbook = readFileSync(
      join(root, "docs/operations/drape-room-release.md"),
      "utf8",
    );

    expect(runbook).toContain("Do not");
    expect(runbook).toContain("pnpm db:migrate");
    expect(runbook).toContain("0029_ai_tryon_reference_metadata.sql");
    expect(runbook).toContain("must run after");
  });
});


describe("Drape Room ledger cost and retention contract", () => {
  it("stamps completed_at on every terminal transition", () => {
    // Both the application finalize and the recovery sweep close the row out.
    const finalize = migration.slice(
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_finalize"'),
    );
    expect(finalize).toContain('"completed_at" = now()');
    const reconcile = migration.slice(
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_reconcile_stale"'),
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_reserve"'),
    );
    expect(reconcile).toContain('"completed_at" = now()');
  });

  it("writes the settled amount into actual_micro_usd so rows reconcile with the bucket", () => {
    const finalize = migration.slice(
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_finalize"'),
    );
    // The same v_settle is added to the bucket and stored on the row, which is
    // what makes SUM(actual_micro_usd) === buckets.settled_micro_usd hold.
    expect(finalize).toContain('"settled_micro_usd" = "settled_micro_usd" + v_settle');
    expect(finalize).toContain('"actual_micro_usd" = v_settle');
    expect(finalize).toContain('"reserved_micro_usd" = "reserved_micro_usd" - v_reserved');
    // A settlement may never exceed what admission reserved.
    expect(finalize).toContain("IF v_settle < 0 OR v_settle > v_reserved THEN RETURN false; END IF;");
  });

  it("settles zero before the provider and the full forecast when usage is unknown", () => {
    expect(migration).toContain("WHEN p_status = 'failed_pre_provider' THEN 0");
    expect(migration).toContain("WHEN p_actual_micro_usd IS NULL THEN v_reserved");
  });

  it("recovers an abandoned invocation without inventing a cheaper outcome", () => {
    const reconcile = migration.slice(
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_reconcile_stale"'),
      migration.indexOf('FUNCTION "public"."ftt_ai_tryon_reserve"'),
    );
    // Never dispatched -> zero. Dispatch attempted -> the full reservation.
    expect(reconcile).toContain("WHEN stale.\"status\" = 'reserved' THEN 0");
    expect(reconcile).toContain("ELSE stale.\"reserved_micro_usd\"");
    expect(reconcile).toContain("'INVOCATION_EXPIRED_PRE_PROVIDER'");
    expect(reconcile).toContain("'PROVIDER_TIMEOUT'");
    expect(reconcile).toContain("\"created_at\" < now() - INTERVAL '10 minutes'");
  });

  it("caps a period so reserved plus settled can never exceed the limit", () => {
    expect(migration).toContain('"ai_tryon_budget_buckets_within_limit"');
    expect(migration).toContain(
      '"ai_tryon_budget_buckets"."reserved_micro_usd" + "ai_tryon_budget_buckets"."settled_micro_usd" <= "ai_tryon_budget_buckets"."limit_micro_usd"',
    );
  });

  it("keeps the product reference nullable, so a deleted product cannot orphan a row", () => {
    // ON DELETE SET NULL means historical product identity is lost on a hard
    // delete. The usage report must therefore tolerate a null product_id.
    expect(migration).toContain(
      'FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null',
    );
  });

  it("retains every metadata row: no scheduled or ad-hoc deletion exists", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"public"\."ai_tryon_requests"/i);
    expect(budgetService).not.toMatch(/DELETE\s+FROM/i);
  });
});
