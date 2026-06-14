# Production cutover runbook — P2→P6 consolidation

**Status:** prepared 2026-06-14 (post-P6 push prep). Nothing here has been executed. This is the step list for promoting the P2–P6 programme from `sprint-abe` to production. Every destructive/outward step is gated on a USER decision.

**Audience:** the principal (Abe) + whoever runs the prod migration. Read top to bottom once before doing anything.

---

## 0. TL;DR of the risk surface

| Area | State | Risk if skipped |
|---|---|---|
| Migration SQL (0004–0016) | ✅ all 13 parse-clean, idempotent | none — the SQL is sound |
| Drizzle **meta** (journal + snapshots) | ⚠️ **fabricated by the autonomous workers** — see §1 | `drizzle-kit migrate` silently applies only 0004–0009, then later snapshots are malformed → **half-migrated prod** |
| GST flag flip | gated on ×1.12 value decision + P2-04a | charged amount ≠ displayed amount |
| Inventory-v2 flag flip | gated on 0004 applied + rehearsal | oversell / stock desync |
| Homepage-blocks flag flip | gated on P3-10b + seed | homepage renders in-code fixture, not DB |
| Branch consolidation | 44 unpushed commits on local `sprint-abe` | remote is stale; PR would miss most of the work |

---

## 1. ⚠️ Migration meta is fabricated — READ FIRST

**Finding.** During the autonomous run, the implementation workers wrote migrations 0004–0016 as **raw idempotent SQL** (`IF NOT EXISTS` / `DO`-blocks) and then **hand-fabricated the drizzle meta** instead of running `drizzle-kit generate`. Evidence:

- `drizzle/meta/_journal.json` stops at **idx 9 / `0009_tags`**. Migrations **0010–0016 are not registered at all** (no journal entry, no snapshot).
- Snapshots `0008_snapshot.json` and `0009_snapshot.json` are **460–647-byte stubs** — no `tables`/`enums`, with a tell-tale `_comment` key.
- The `id`/`prevId` values across 0004–0009 are hand-typed incrementing hex (`a1b2c3d4…`, `b2c3d4e5…`), not the UUIDs drizzle emits.
- `drizzle-kit generate` **aborts**: `0007/0008/0009_snapshot.json data is malformed`.

**Consequence.** `npm run db:migrate` (`drizzle-kit migrate`) **cannot be trusted** for this batch. It would apply through the last coherent journal entry and stop — deploying app code that expects tables (`theme_versions`, `channel_metrics`, `discounts`, `restock_notify_requests`, the `orders` refund/tracking cols, …) that were never created.

**What IS sound.** All 13 `.sql` files parse clean (85 statements total, validated with `pg-query-emscripten` 2026-06-14) and `db/schema.ts` (32 tables) is the accurate source of truth — it contains every 0010–0016 change.

### Two repair paths — DECISION REQUIRED (#G-MIGRATE)

**Path A (RECOMMENDED) — apply idempotent SQL directly, then re-baseline meta.**
The SQL was purpose-built idempotent for exactly this build-not-run scenario; this path does not depend on the corrupted meta.
1. On a Neon branch (§2), apply `drizzle/0004_*.sql … 0016_*.sql` in numeric order via `psql` (they only create objects that don't exist on a prod copy, so they apply cleanly first-run).
2. Verify schema + rowcounts (§2).
3. Apply the same SQL to prod.
4. **Re-baseline drizzle meta**: once the DB matches `db/schema.ts`, run `drizzle-kit generate` — it should report **"No schema changes"** (or emit a no-op), giving a clean forward journal. Commit the regenerated meta. From here on, `drizzle-kit migrate` works normally.
   - Also delete the fabricated stub snapshots and reconcile `__drizzle_migrations` so the baseline is honest.

**Path B — rebuild meta from the prod baseline, squash to one generated migration.**
Reset `drizzle/meta` to the last real (pre-run) snapshot, `drizzle-kit generate` → one consolidated `0004` migration from `db/schema.ts`, then `drizzle-kit migrate`. Cleaner long-term journal, BUT: depends on the pre-run baseline snapshot accurately representing prod, loses the `IF NOT EXISTS` safety on a non-fresh DB, and loses granular history. More moving parts.

> Recommendation: **Path A.** Lowest risk given the meta is untrustworthy and the SQL is already idempotent and parse-verified. Do the meta re-baseline (step 4) as a follow-up so future migrations are clean.

---

## 2. Neon rehearsal (do this BEFORE touching prod)

Requires Neon access (the `mcp__plugin_neon_neon` MCP or the Neon console) — **user-held credential**.

```
# 1. Create a branch off prod (a full copy; safe sandbox)
#    Neon console → Branches → "New branch" from production, or via MCP.
# 2. Point a scratch DATABASE_URL at the branch.
# 3. Apply the batch in order (Path A):
for f in drizzle/0004_*.sql drizzle/0005_*.sql drizzle/0006_*.sql drizzle/0007_*.sql \
         drizzle/0008_*.sql drizzle/0009_*.sql drizzle/0010_*.sql drizzle/0011_*.sql \
         drizzle/0012_*.sql drizzle/0013_*.sql drizzle/0014_*.sql drizzle/0015_*.sql \
         drizzle/0016_*.sql; do
  echo ">>> $f"; psql "$BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

**Verify after apply:**
- `\dt` shows the new tables: `reservations, events, navigation_menus, page_versions, pages, redirects, theme_settings, product_types, collection_products, product_tags, tags, theme_versions, channel_metrics, discounts, restock_notify_requests`.
- New columns: `products.quantity_available, products.type_id, products.attributes, collections.rules, orders.reminder_sent_at, orders.discount_id, orders.discount_code, orders.refund_id, orders.refunded_amount_paise, orders.refunded_at, orders.internal_note, orders.tracking_number, orders.tracking_carrier`.
- New enums: `menu_slot, page_status, discount_type`.

**Rowcount expectation — only 0004 backfills data:**
- `products.quantity_available`: `available`→1, `reserved`→1, `sold`→0. Expect `count(*) where quantity_available=1` == count of products currently `available`+`reserved`; `=0` == count currently `sold`.
- `reservations`: one row per product currently in `reserved` state (with its `reservedUntil` → `expires_at`).
- All other migrations are new tables or **nullable** column adds — zero backfill, zero row churn on existing tables.

**Rollback = delete the Neon branch.** No prod impact. Re-create and re-run to iterate.

**Sign-off:** capture the `\dt` diff + the 0004 rowcounts → this is the #G-P2 / #G-P4 migration evidence.

---

## 3. Flag-flip sequence (prod, AFTER migrations applied)

All three flags ship **OFF** and are behavior-preserving. Order matters:

1. **`FTT_FEATURE_INVENTORY_V2`** — only after 0004 is applied + the rehearsal rowcounts look right. Flipping ON moves the reservation claim to the `reservations` table (atomic claim, P4-05). Watch oversell metrics for one cycle.
2. **`FTT_FEATURE_GST_INCLUSIVE`** — only after the **×1.12 value decision** (#G-GST/P2-04) AND **P2-04a** (checkout-page-client must show server-computed totals; the flag is not `NEXT_PUBLIC`, so the client currently shows a flag-OFF estimate). Flipping ON without P2-04a → displayed total ≠ charged total. Also a prerequisite for P5 feeds (Google India requires feed price == landing price).
3. **`FTT_FEATURE_BLOCKS_HOMEPAGE`** — only after **P3-10b** (switch the flag-ON homepage to read the *published DB version* instead of the in-code fixture) AND running the homepage seed (`scripts/seed-homepage-cms.ts` per P3-10). Otherwise the "blocks" homepage renders the in-code fixture, not editable content.

---

## 4. Branch consolidation (PR-only — `enforce-pr-only.yml` is active)

**Current topology (2026-06-14):**
- `sprint-abe` (local, `30ce0ae`) is **89 ahead / 0 behind `origin/development`** — a clean superset.
- **44 of those commits are NOT pushed** to `origin/sprint-abe` — push first.
- `origin/main` (`b1e9893`, the #G-P1 merge) is "1 behind" only as a *merge-commit object*; its content is already in `sprint-abe`. No missing prod content.

**Steps:**
1. `git push origin sprint-abe` (pushes the 44 unpushed commits). Verify `origin/sprint-abe` == local.
2. **PR #1 — `sprint-abe → development`**: brings P2–P6 into `development`. Clean merge (superset). CI (`ci.yml`, `lighthouse-ci.yml`) must pass.
3. **PR #2 — `development → main`** (the prod-promotion / #G gate, mirrors PR #36 for P1): merges cleanly once development carries P2–P6. This is the deploy trigger.
4. Do **not** hot-deploy from a branch — promotion goes through PR #2.

> Alternative: a single `sprint-abe → main` PR. The two-step (via development) matches the established #G-P1 pattern and keeps `development` as the integration branch.

---

## 5. Other batched prod items (not blocking the merge, but part of the push)

- **P5-03 / #G-P5**: console submissions (GMC, GSC, GA4, Meta, Vercel API token) + GTIN-exemption — see `docs/spikes/channel-audit.md` §1 for the credential checklist. Feeds need the GST flag ON first (A-CH2).
- **#G-DOMAIN**: confirm `www.fromthetrunk.shop` canonical; wire `.com`? Rides into GSC/feed config.
- **P4 taxonomy**: confirm product types (saree + blouse + accessory).
- **P4-07**: retire legacy `details*` columns — *prod-data-gated, do AFTER P4 is live and stable*.
- **Restore `.env.production.example`** from `git stash@{0}` (P2-era flag docs; confidential — decide what to commit).
- **P1-15**: unpublish the "test chiffon" product (also leaks into storefront search per P6-03b).
- **Xeno** slice relocation + redaction (channel ID + business emails) — untracked, never committed; keep out of the PR.
- **`.env`**: add the new keys (error-tracker `SENTRY_DSN`, channel-metrics creds, `FEEDS_PUBLIC_TOKEN`, etc.) per `.env.example`.

---

## 6. Quick reference — what each migration does

| Mig | Objects | Backfill |
|---|---|---|
| 0004 inventory_v2 | `products.quantity_available`, `reservations` table | ✅ qty from stock_status + reservation rows |
| 0005 events | `events` table | — |
| 0006 content | `pages`, `page_versions`, `navigation_menus`, `redirects`, `theme_settings` + enums `page_status`, `menu_slot` | — |
| 0007 product_types | `product_types` table, `products.type_id`, `products.attributes` | — |
| 0008 collections | `collection_products` table, `collections.rules` | — |
| 0009 tags | `tags`, `product_tags` tables | — |
| 0010 theme-versions | `theme_versions` table | — |
| 0011 channel-metrics | `channel_metrics` table | — |
| 0012 order-reminder-sent | `orders.reminder_sent_at` (nullable) | — |
| 0013 discounts | `discounts` table + enum `discount_type` | — |
| 0014 orders_discount | `orders.discount_id`, `orders.discount_code` (nullable) | — |
| 0015 wishlist-notify | `restock_notify_requests` table | — |
| 0016 orders_refund_tracking | `orders.refund_id/refunded_amount_paise/refunded_at/internal_note/tracking_number/tracking_carrier` (nullable) | — |
