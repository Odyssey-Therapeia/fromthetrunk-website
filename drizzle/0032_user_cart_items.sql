-- Authenticated server-side shopping bag.
--
-- Commerce is authenticated-first: a shopper signs in through the commerce OTP
-- popup before their first bag action, so a bag always belongs to a user and
-- there is no anonymous cart to reconcile. One active bag per customer, so the
-- rows key straight off (user_id, product_id) with no separate carts table.
--
-- This records WHICH CUSTOMER received a given reservation. It does not become
-- the reservation identity: products.stock_status + products.reserved_until
-- plus the signed token remain authoritative, and the exact reserved_until
-- match stays the only thing permitted to release a hold.
--
-- Hand-authored (do NOT run drizzle-kit generate — the journal has out-of-band
-- drift). Safe to re-apply: uses IF NOT EXISTS throughout.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_cart_items" (
  "user_id"          uuid        NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "product_id"       uuid        NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,

  -- The signed proof this customer received for this exact hold. Null for
  -- made-to-order blouses, which are never reserved.
  "reservation_token" text,
  "reserved_until"    timestamptz,
  "selected_options"  jsonb,

  -- active | payment_pending | ordered | expired
  "status"            text        NOT NULL DEFAULT 'active',
  "added_at"          timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"        timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT "user_cart_items_pkey" PRIMARY KEY ("user_id", "product_id")
);

--> statement-breakpoint

-- "who holds this saree?" — one row, straight from the product.
CREATE INDEX IF NOT EXISTS "user_cart_items_product_idx"
  ON "user_cart_items" ("product_id");

--> statement-breakpoint

-- Lazy expiry sweeps by hold, so it must not scan the table.
CREATE INDEX IF NOT EXISTS "user_cart_items_reserved_until_idx"
  ON "user_cart_items" ("reserved_until");

--> statement-breakpoint

-- Reading one customer's live bag.
CREATE INDEX IF NOT EXISTS "user_cart_items_user_status_idx"
  ON "user_cart_items" ("user_id", "status");
