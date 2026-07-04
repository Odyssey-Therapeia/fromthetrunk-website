ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
