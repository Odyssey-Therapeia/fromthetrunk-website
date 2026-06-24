-- PDP/API hardening indexes for product detail stock reads and reservation lookups.
-- Hand-authored. Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT run directly -- migrations are batched per the deploy process.

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_status_created_at_idx"
  ON "products" ("status", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_images_product_sort_idx"
  ON "product_images" ("product_id", "sort_order");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reservations_product_expires_at_idx"
  ON "reservations" ("product_id", "expires_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "wishlist_items_product_idx"
  ON "wishlist_items" ("product_id");
