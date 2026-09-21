-- Index the expiry sweep's predicate.
--
-- Three call sites filter on exactly (stock_status = 'reserved' AND reserved_until < now())
-- and full-scan products today: the 15-minute release cron, the admin release-expired route,
-- and that cron's own UPDATE. Lazy expiry would make the predicate hotter still.
--
-- Hand-authored (do NOT run drizzle-kit generate — the journal has out-of-band drift).
-- Purely additive: an index changes no query result, no write semantics, and no API shape.
-- Safe to re-apply: uses IF NOT EXISTS.

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_stock_reserved_until_idx"
  ON "products" ("stock_status", "reserved_until");
