-- Gift options for orders: captured at checkout, persisted for fulfilment / the gift card.
-- Hand-authored. Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT run directly -- migrations are batched per the deploy process.

--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_gift" boolean DEFAULT false NOT NULL;

--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gift_from" text;

--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gift_message" text;
