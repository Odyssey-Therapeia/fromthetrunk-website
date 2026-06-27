-- Allow floating review-tab ratings to keep one decimal place.

--> statement-breakpoint

ALTER TABLE IF EXISTS "site_feedback_submissions"
  ALTER COLUMN "rating" TYPE numeric(2, 1)
  USING round("rating"::numeric, 1);

--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.site_feedback_submissions') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'site_feedback_submissions_rating_range_check'
        AND conrelid = 'public.site_feedback_submissions'::regclass
    ) THEN
    ALTER TABLE "site_feedback_submissions"
      ADD CONSTRAINT "site_feedback_submissions_rating_range_check"
      CHECK ("rating" >= 1 AND "rating" <= 5);
  END IF;
END $$;
