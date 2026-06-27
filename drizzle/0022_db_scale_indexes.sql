-- Phase 4.4E database scale indexes.
-- Safe to re-apply: uses IF NOT EXISTS throughout.
-- Production note: for large existing tables, run equivalent CREATE INDEX
-- CONCURRENTLY statements in a non-transactional maintenance step.

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "users_phone_idx"
  ON "users" ("phone");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "addresses_user_created_at_idx"
  ON "addresses" ("user_id", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "addresses_user_default_idx"
  ON "addresses" ("user_id", "is_default");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_status_stock_created_at_idx"
  ON "products" ("status", "stock_status", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_status_price_idx"
  ON "products" ("status", "price_paise", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_collection_status_created_at_idx"
  ON "products" ("collection_id", "status", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_tags_tag_product_idx"
  ON "product_tags" ("tag_id", "product_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_user_created_at_idx"
  ON "orders" ("user_id", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_user_payment_created_at_idx"
  ON "orders" ("user_id", "payment_status", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_status_created_at_idx"
  ON "orders" ("status", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_payment_status_created_at_idx"
  ON "orders" ("payment_status", "created_at", "id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_razorpay_order_id_idx"
  ON "orders" ("razorpay_order_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_payment_id_idx"
  ON "orders" ("payment_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_shipping_email_lower_idx"
  ON "orders" (lower("shipping_email"));

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_security_events_user_created_at_idx"
  ON "auth_security_events" ("user_id", "created_at");
