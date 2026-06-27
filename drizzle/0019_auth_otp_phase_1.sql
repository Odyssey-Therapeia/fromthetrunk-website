-- OTP auth phase 1: challenge storage and auth security event audit log.
-- Hand-authored because drizzle-kit generate is blocked by existing malformed
-- meta snapshots. Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT run directly -- migrations are batched per the deploy process.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_otp_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purpose" text NOT NULL,
  "identifier_type" text NOT NULL,
  "identifier_normalized" text NOT NULL,
  "delivery_email" text NOT NULL,
  "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "otp_hash" text NOT NULL,
  "challenge_token_hash" text NOT NULL,
  "login_ticket_hash" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "send_count" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "resend_available_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "consumed_at" timestamptz,
  "request_ip_hash" text,
  "user_agent_hash" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_otp_challenges_challenge_token_hash_unique"
  ON "auth_otp_challenges" ("challenge_token_hash");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_otp_challenges_login_ticket_hash_unique"
  ON "auth_otp_challenges" ("login_ticket_hash")
  WHERE "login_ticket_hash" IS NOT NULL;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_otp_challenges_identifier_purpose_created_idx"
  ON "auth_otp_challenges" ("identifier_normalized", "purpose", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_otp_challenges_expires_at_idx"
  ON "auth_otp_challenges" ("expires_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_otp_challenges_user_idx"
  ON "auth_otp_challenges" ("user_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_otp_challenges_active_idx"
  ON "auth_otp_challenges" ("identifier_normalized", "purpose", "expires_at")
  WHERE "consumed_at" IS NULL;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_security_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "identifier_type" text,
  "identifier_normalized" text,
  "ip_hash" text,
  "user_agent_hash" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT NOW() NOT NULL
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_security_events_event_type_created_idx"
  ON "auth_security_events" ("event_type", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_security_events_identifier_created_idx"
  ON "auth_security_events" ("identifier_normalized", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_security_events_user_idx"
  ON "auth_security_events" ("user_id");
