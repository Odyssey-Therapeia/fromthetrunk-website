-- OTP auth phase 4.1: short-lived login and registration ticket expiry.
-- Safe to re-apply: uses IF NOT EXISTS guards.

--> statement-breakpoint

ALTER TABLE "auth_otp_challenges"
  ADD COLUMN IF NOT EXISTS "login_ticket_expires_at" timestamptz;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_otp_challenges_login_ticket_expires_at_idx"
  ON "auth_otp_challenges" ("login_ticket_expires_at");
