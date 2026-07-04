# Payment Vercel Region Report

## Audit

- **Function region:** no region pinning anywhere. `app/api/v2/[...route]/route.ts:5` sets only
  `export const maxDuration = 120`. No `export const runtime`, no `preferredRegion`, no `vercel.json`
  `regions`, no `next.config` functions config. → The payment route runs in the Vercel project's
  **default region**, consistent with the production log showing `iad1` (US East) while the user was
  in `bom1` (Mumbai).
- **DB provider/region:** Neon serverless over **HTTP** (`@neondatabase/serverless` + `drizzle-orm/neon-http`,
  `db/index.ts:1-19`), IPv4 forced via an undici agent (a network-reliability workaround, `AGENTS.md:29`).
  Connection via `DATABASE_URL`. **The Neon region is not determinable from the repo** — no
  `*.aws.neon.tech` / AWS-region host string appears in any tracked file.
- **Request path:** user in `bom1`, function executed in `iad1`. The route makes **many sequential
  `await db…` round-trips** (`payments.ts:314-796`), so DB latency dominates.

## Recommendation

**Do not blindly pin `preferredRegion="bom1"`.** Moving the function to Mumbai only helps if the
Neon database is in an India/Singapore region; if the DB is in a US region (co-located with `iad1`),
moving the function to `bom1` would put every one of the many sequential DB round-trips across the
US↔India link and make create-order **slower**, widening (not shrinking) the abort window.

### Decision procedure (owner)

1. Check the Neon project region in the Neon console.
2. **If Neon is `ap-south-1` (Mumbai) or `ap-southeast-1` (Singapore):** add to the payment API route
   (`app/api/v2/[...route]/route.ts`):
   ```ts
   export const runtime = "nodejs";
   export const preferredRegion = "bom1";
   export const maxDuration = 15;   // create-order is fast; 120 is unnecessarily long
   ```
   (Note: `maxDuration` currently 120 also covers the webhook, which awaits emails + a Razorpay
   fetch — keep 120 for the webhook, or split routes before shortening.)
3. **If Neon is a US region:** keep the function in `iad1` (co-located with the DB). Do not pin `bom1`.
   Optionally co-locate everything closer to India by migrating/branching the Neon DB to `ap-south-1`
   first, then pin `bom1` — a larger, separate decision.

### Why region is not the `Status: 0` cause

Cross-region latency was ~292 ms total here — well under the 2-minute limit. The `Status: 0` was a
client abort, not a server slowdown. Region tuning is a **latency/UX optimisation** (smaller abort
window), not a fix for the reported symptom. Left as a documented, owner-gated decision.
