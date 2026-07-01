-- Blouse purchase options: snapshot selected cart options on order line items.
-- Hand-authored to match the repo's idempotent migration pattern.

--> statement-breakpoint

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "selected_options" jsonb NOT NULL DEFAULT '{}'::jsonb;

--> statement-breakpoint

UPDATE "product_types"
SET
  "attribute_defs" = "attribute_defs" || '[
    {"key":"availableSizes","meta":{"type":"list-of-text","label":"Available Sizes","placeholder":"XS, S, M, L"},"required":false}
  ]'::jsonb,
  "updated_at" = now()
WHERE "slug" = 'blouse'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("attribute_defs") AS def
    WHERE def->>'key' = 'availableSizes'
  );

--> statement-breakpoint

UPDATE "product_types"
SET
  "attribute_defs" = "attribute_defs" || '[
    {"key":"sleeveLength","meta":{"type":"text","label":"Sleeve Length","placeholder":"e.g. Short sleeve"},"required":false}
  ]'::jsonb,
  "updated_at" = now()
WHERE "slug" = 'blouse'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("attribute_defs") AS def
    WHERE def->>'key' = 'sleeveLength'
  );

--> statement-breakpoint

UPDATE "product_types"
SET
  "attribute_defs" = "attribute_defs" || '[
    {"key":"blouseSize","meta":{"type":"text","label":"Blouse Size","placeholder":"e.g. M"},"required":false}
  ]'::jsonb,
  "updated_at" = now()
WHERE "slug" = 'blouse'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("attribute_defs") AS def
    WHERE def->>'key' = 'blouseSize'
  );

--> statement-breakpoint

UPDATE "product_types"
SET
  "attribute_defs" = "attribute_defs" || '[
    {"key":"fitNotes","meta":{"type":"textarea","label":"Fit Notes","placeholder":"Any blouse fit notes for the buyer"},"required":false}
  ]'::jsonb,
  "updated_at" = now()
WHERE "slug" = 'blouse'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("attribute_defs") AS def
    WHERE def->>'key' = 'fitNotes'
  );
