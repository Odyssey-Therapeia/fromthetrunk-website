-- Record the shopper's optional-tracking consent on the order.
--
-- The server forwards order_created / payment_completed to Google (GA4
-- Measurement Protocol) and Meta (Conversions API). Those are third-party
-- analytics and advertising purposes, so they need the same consent the cookie
-- banner collects — but payment frequently completes in a context with no
-- browser attached: a Razorpay webhook, or the payment-hold expiry reconciler.
-- There is no cookie to read at that moment.
--
-- So the decision is captured once, at order creation, while the visitor is
-- still on the page, and read back later by whichever path completes the
-- order. NULL means "no decision recorded" — every order placed before this
-- column existed — and lib/analytics/server-consent.ts treats NULL as refusal,
-- so the default is to send nothing.
--
-- Hand-authored (do NOT run drizzle-kit generate — the journal has out-of-band drift).
-- Purely additive: two nullable columns, no default, no backfill, no change to
-- any existing query result or write path. Safe to re-apply: uses IF NOT EXISTS.

--> statement-breakpoint

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "analytics_consent" boolean;
--> statement-breakpoint

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "advertising_consent" boolean;
