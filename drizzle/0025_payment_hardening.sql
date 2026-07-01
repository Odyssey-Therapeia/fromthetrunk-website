ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_payment_id_unique"
  ON "orders" ("payment_id")
  WHERE "payment_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_razorpay_order_id_unique"
  ON "orders" ("razorpay_order_id")
  WHERE "razorpay_order_id" IS NOT NULL;
