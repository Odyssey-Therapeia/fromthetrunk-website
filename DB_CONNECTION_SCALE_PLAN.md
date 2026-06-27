# DB_CONNECTION_SCALE_PLAN.md

Date: 2026-06-27

Scope: Phase 4.4E database connection and deployment-region strategy for From the Trunk.

## Current State

| Area | Finding |
|---|---|
| Driver | `@neondatabase/serverless` `neon()` with `drizzle-orm/neon-http` in `db/index.ts`. |
| Pooler status | Local `DATABASE_URL` host is a Neon pooler hostname in `us-east-1`; no password or full URL is documented here. |
| App retry behavior | `withRetry()` wraps read paths for transient Neon failures. |
| Runtime model | Next.js server/Hono routes using serverless-style request handling. |
| Region pin | No `vercel.json` region pin is present in the repo. |

## Recommendation

Keep the Neon HTTP driver for this release candidate and reduce query fan-out first through caching, pagination caps, and indexes.

Production environment shape:

- Use the Neon pooled endpoint for `DATABASE_URL`.
- Keep SSL and channel binding enabled.
- Keep server-only DB env vars out of client bundles.
- Pin Vercel functions near the Neon region, likely `iad1` for the current `us-east-1` database, after staging validation.

## Why Not Switch Drivers Now

The HTTP driver pays a per-query network round trip, but it avoids long-lived pool management in serverless runtimes. Switching to `pg` plus `drizzle-orm/node-postgres` could help hot Node runtime paths, but it changes runtime behavior and should be benchmarked separately.

Do not migrate drivers in Phase 4.4E unless staging evidence shows the HTTP driver remains the dominant bottleneck after:

- public catalog cache warm-up,
- query count reduction,
- index migration,
- Vercel region pinning.

## Rollback Plan

1. Keep the current Neon HTTP code path as the baseline.
2. If a region pin causes deployment/runtime issues, remove the Vercel region config and redeploy.
3. If a future driver migration is attempted, guard it behind a separate branch and compare route timings, error rate, connection count, and Neon compute utilization before merging.

## Evidence Still Needed

- Staging p95 timings before and after region pin.
- Neon query latency and compute utilization during warm cached browsing.
- Function duration comparison for `/collection`, `/api/v2/payments/create-order`, `/api/v2/orders`, and `/api/v2/auth/otp/start`.

