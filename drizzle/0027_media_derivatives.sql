DO $$ BEGIN
  CREATE TYPE "media_derivative_role" AS ENUM (
    'seo_master',
    'pdp',
    'card',
    'thumbnail',
    'social_og',
    'feed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "media_derivative_status" AS ENUM (
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "media_derivatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
  "role" "media_derivative_role" NOT NULL,
  "object_key" text NOT NULL,
  "url" text,
  "mime_type" text,
  "byte_size" integer,
  "width" integer,
  "height" integer,
  "generation_version" integer NOT NULL,
  "source_hash" text NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL,
  "status" "media_derivative_status" DEFAULT 'processing' NOT NULL,
  "failure_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_derivatives_generation_version_positive"
    CHECK ("generation_version" > 0),
  CONSTRAINT "media_derivatives_ready_metadata_complete"
    CHECK (
      "status" <> 'ready' OR (
        "url" IS NOT NULL AND
        "mime_type" IS NOT NULL AND
        "byte_size" > 0 AND
        "width" > 0 AND
        "height" > 0
      )
    ),
  CONSTRAINT "media_derivatives_ready_url_safe_shape"
    CHECK (
      "status" <> 'ready' OR (
        "url" LIKE 'https://%' AND
        position('?' in "url") = 0 AND
        position('#' in "url") = 0 AND
        position('/_next/image' in "url") = 0
      )
    )
);

CREATE INDEX IF NOT EXISTS "media_derivatives_asset_idx"
  ON "media_derivatives" ("media_asset_id");

CREATE UNIQUE INDEX IF NOT EXISTS "media_derivatives_asset_role_version_unique"
  ON "media_derivatives" ("media_asset_id", "role", "generation_version");

CREATE UNIQUE INDEX IF NOT EXISTS "media_derivatives_object_key_unique"
  ON "media_derivatives" ("object_key");
