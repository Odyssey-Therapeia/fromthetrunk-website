ALTER TABLE "ai_tryon_requests"
  ADD COLUMN "reference_contract_version" text,
  ADD COLUMN "product_reference_version" text,
  ADD COLUMN "reference_mode" text,
  ADD COLUMN "reference_count" integer;
--> statement-breakpoint
ALTER TABLE "ai_tryon_requests"
  ADD CONSTRAINT "ai_tryon_requests_reference_metadata_consistent" CHECK (
    (
      "reference_contract_version" IS NULL
      AND "product_reference_version" IS NULL
      AND "reference_mode" IS NULL
      AND "reference_count" IS NULL
    )
    OR
    (
      "reference_contract_version" IS NOT NULL
      AND "product_reference_version" IS NOT NULL
      AND "reference_mode" IS NOT NULL
      AND "reference_count" IS NOT NULL
      AND "reference_contract_version" = 'gallery-v2'
      AND length("product_reference_version") BETWEEN 1 AND 256
      AND (
        ("reference_mode" = 'single' AND "reference_count" = 2)
        OR ("reference_mode" = 'dual' AND "reference_count" = 3)
      )
    )
  );
