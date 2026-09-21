-- Phase 4: Restock notify delivery lifecycle.
--
-- 0015 captured intent only: product, email, user, created_at. Nothing recorded
-- whether an email was ever sent, so the capture UI could not honestly promise
-- one. These columns carry a request from pending to notified, survive a
-- crashed worker, and let two cron runs claim disjoint work.
--
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Additive and idempotent: safe to re-apply.

--> statement-breakpoint

ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pending';

--> statement-breakpoint

ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz;

--> statement-breakpoint

ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "notified_at" timestamptz;

--> statement-breakpoint

ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;

--> statement-breakpoint

ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamptz;

--> statement-breakpoint

-- Sanitised failure reason. Never a provider payload, never the recipient.
ALTER TABLE "restock_notify_requests"
  ADD COLUMN IF NOT EXISTS "last_error" text;

--> statement-breakpoint

-- The worker scans by status, and claims oldest-first within a product.
CREATE INDEX IF NOT EXISTS "restock_notify_requests_status_idx"
  ON "restock_notify_requests" ("status", "created_at");
