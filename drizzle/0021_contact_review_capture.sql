-- Contact + review capture phase.
-- Safe to re-apply: uses IF NOT EXISTS guards.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "contact_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "topic" text,
  "message" text NOT NULL,
  "source" text DEFAULT 'connect_dialog' NOT NULL,
  "page_path" text,
  "status" text DEFAULT 'new' NOT NULL,
  "acknowledgement_email_sent_at" timestamptz,
  "internal_notification_sent_at" timestamptz,
  "ip_hash" text,
  "user_agent_hash" text,
  "message_hash" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_submissions_created_at_idx"
  ON "contact_submissions" ("created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_submissions_status_created_at_idx"
  ON "contact_submissions" ("status", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_submissions_email_created_at_idx"
  ON "contact_submissions" ("email", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_submissions_message_hash_created_at_idx"
  ON "contact_submissions" ("message_hash", "created_at");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "site_feedback_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rating" integer NOT NULL,
  "comment" text NOT NULL,
  "source" text DEFAULT 'floating_review_tab' NOT NULL,
  "page_path" text,
  "status" text DEFAULT 'new' NOT NULL,
  "ip_hash" text,
  "user_agent_hash" text,
  "comment_hash" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "site_feedback_submissions_created_at_idx"
  ON "site_feedback_submissions" ("created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "site_feedback_submissions_rating_created_at_idx"
  ON "site_feedback_submissions" ("rating", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "site_feedback_submissions_status_created_at_idx"
  ON "site_feedback_submissions" ("status", "created_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "site_feedback_submissions_comment_hash_created_at_idx"
  ON "site_feedback_submissions" ("comment_hash", "created_at");
