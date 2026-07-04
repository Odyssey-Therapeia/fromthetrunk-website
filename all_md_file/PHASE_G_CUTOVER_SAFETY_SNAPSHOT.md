# Phase G Cutover Safety Snapshot

Date: 2026-07-03
Repository: `/Users/JP/Documents/codding projects/git/fromthetrunk-website`
Branch: `JP-Sprint`
Decision: NO-GO for production cutover.

## Safety Boundary

- No production deploy was started.
- No production DDL was applied.
- No Search Console submission was made.
- No live Razorpay payment was attempted.
- No customer email, OTP, or notification flow was triggered.
- No secret values, cookie values, database URLs, or customer data were printed into this report.
- Phase G reports were written under `all_md_file/` per the workspace note.

## Repository State

The working tree is intentionally dirty from the prior audit phases. Phase G did not revert or clean unrelated work.

Key dirty-state summary from `git status --short`:

- Existing tracked deletions remain: `Archive.zip`, `FINAL_PRE_PUSH_COMMAND_RESULTS.md`, `FINAL_PRE_PUSH_SAFETY_SNAPSHOT.md`, `LEGAL_CONTENT.md`, `PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md`, `SERVER_RATE_LIMIT_MATRIX.md`, `handoff-top-viewed.md`.
- Existing checkout/auth/payment/SEO/performance files remain modified, including `api/hono/routes/payments.ts`, `db/schema.ts`, `db/queries/orders.ts`, `app/sitemap.ts`, checkout components, auth/account components, SEO helpers, and tests.
- Phase artifacts and new implementation/test files remain untracked, including `all_md_file/`, `drizzle/0026_orders_idempotency_key.sql`, Phase C/D e2e specs, Phase D unit specs, and supporting checkout files.

## Safety Commands

| Command | Result |
| --- | --- |
| `git status --short` | Dirty tree; expected from prior phases. |
| `git diff --name-status` | Dirty tracked files confirmed; no rollback performed. |
| `git diff --check` | PASS. |
| `test -f pnpm-lock.yaml && echo "pnpm-lock exists" || echo "pnpm-lock missing"` | `pnpm-lock exists`. |
| `node -v` | Local shell reports `v25.4.0`. Project engines require `<25`, so verification commands were run with the explicit Node 22 wrapper. |
| `pnpm -v` | `10.28.0`. |
| `npx -y -p node@22 -p pnpm@10.28.0 node -v` | Prior Phase G preflight established Node 22 wrapper availability. |

## Local/Tooling Notes

- `.vercel/project.json` is absent in the repo, so the local checkout is not Vercel-linked.
- Global `vercel` CLI was not available from the shell.
- Vercel connector access could inspect project/deployment metadata, but did not expose environment variable values or presence checks.
- Port `3000` was free before Playwright and was free again after LHCI/Playwright finished.

## Phase G Safety Result

Safety preflight itself is complete, but the cutover remains blocked by unresolved production verification gates:

- Production environment variables are not verified.
- Production DDL has not been owner-approved, applied, or verified.
- Deployed HTTPS auth/cookie behavior is not verified.
- `npm run agent:check` fails the public mobile LCP policy.
- Live sitemap content does not match current source-level SEO changes.
