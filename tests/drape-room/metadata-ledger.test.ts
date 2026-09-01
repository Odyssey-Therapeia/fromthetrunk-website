import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "drizzle/0028_ai_tryon_metadata.sql"),
  "utf8",
);

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
});
