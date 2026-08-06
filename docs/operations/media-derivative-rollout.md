# Product media derivative rollout

This rollout is additive. Original `media_assets` rows and Blob objects remain
untouched, and every server-only switch defaults to disabled. A resource named
"staging" is not sufficient proof of isolation.

## Required identity evidence

Maintain a protected, uncommitted production reference sheet containing hashes
of the Neon project ID, branch ID, hostname/database tuple, Blob store ID, and
public Blob hostname. Never put credentials in the sheet.

Before a staging write:

1. Create/select a non-default Neon staging branch or project. Record and hash
   its project ID, branch ID, hostname and database; prove the tuple differs
   from production.
2. Create a separate public Vercel Blob store connected only to staging/Preview.
   Prove its store ID and public hostname differ from production and the three
   historical source hosts.
3. Use a gitignored staging environment file. It must define the staging
   `DATABASE_URL`, `FTT_MEDIA_EXECUTION_ENVIRONMENT=staging`,
   `FTT_MEDIA_DATABASE_ID`, `FTT_MEDIA_BLOB_STORE_ID`,
   `FTT_MEDIA_DERIVATIVE_BLOB_TOKEN`, the exact
   `FTT_MEDIA_DERIVATIVE_DESTINATION_HOST`, and protected production comparison
   identifiers. Keep all rollout flags `0`.
4. Use the dedicated derivative token only. Do not rely on ambient
   `BLOB_READ_WRITE_TOKEN`, linked-project state, or `.env.local`.

The current checkout has no such independently proven staging identities.
Migration, backfill and activation must remain blocked until they exist.

## Stage A: schema and tooling, consumption disabled

`drizzle/meta/_journal.json` currently stops before migration 0027, so the
current `pnpm db:migrate` path is not a valid way to apply it. First repair and
review Drizzle metadata, or use the maintained, reviewed raw-SQL ledger process
to apply only `drizzle/0027_media_derivatives.sql` to the explicitly selected
staging database. Do not let `drizzle.config.ts` silently select `.env.local`.

Verify transactionally:

- table, enums, indexes, constraints, unique key and ready-state checks;
- exact product and media row counts before/after;
- all three rollout flags remain absent or `0`;
- the gate fails only for missing coverage, not schema corruption.

## Stage B: controlled staging backfill

Run the script with an explicitly loaded staging environment, not the package's
default local file:

```sh
pnpm exec tsx --env-file=.env.staging \
  scripts/media/backfill-derivatives.ts \
  --environment=staging
```

Review the dry-run counts. Compute the printed sanitized database and Blob
fingerprints, then execute only after they match the reviewed staging evidence:

```sh
pnpm exec tsx --env-file=.env.staging \
  scripts/media/backfill-derivatives.ts \
  --execute \
  --environment=staging \
  --confirm-environment=staging \
  --confirm-database-fingerprint=<sanitized-hash> \
  --confirm-blob-store-fingerprint=<sanitized-hash> \
  --confirm-write=GENERATE_IMMUTABLE_DERIVATIVES \
  --concurrency=2 \
  --report-dir=reports/media-derivatives/staging
```

The script refuses staging execution unless its runtime binding and both
resource fingerprints match, production comparison identities exist and are
different, consumption is off, and a dedicated token plus exact destination
host are present. It paginates all published products and resumes deterministic
immutable objects by validating an existing object before repairing the DB row.

Re-run until failures are resolved, then run the gate through the same explicit
environment. The gate paginates products, checks current-source timestamps,
rejects ready rows carrying failures, and HEAD-verifies pathname, byte size,
MIME type and destination host for every ready object. A second full run must
produce zero uploads and zero duplicate rows.

## Stage C: staging activation

Only after 100% coverage, rendered SEO/feed parity, browser network budgets,
tests and mobile Lighthouse all pass:

1. Enable `FTT_MEDIA_DERIVATIVE_PUBLISH_GUARD=1`.
2. Enable `FTT_MEDIA_DERIVATIVE_UPLOADS_ENABLED=1`.
3. Enable `FTT_MEDIA_DERIVATIVES_ACTIVE=1` last.
4. Re-run the full gate and browser/Lighthouse matrix against that exact build.

Production requires a new explicit authorization and the same sequence. This
runbook is not production authorization.

## Rollback

Set `FTT_MEDIA_DERIVATIVES_ACTIVE=0` first. This returns pre-activation delivery
without deleting rows or Blob objects. Disable publication/upload-generation
flags only if operational recovery requires it. Leave the additive table and
immutable objects in place; destructive schema or Blob cleanup is a separate,
explicitly approved operation.
