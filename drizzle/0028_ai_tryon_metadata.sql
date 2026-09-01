CREATE TYPE "public"."ai_tryon_request_status" AS ENUM(
  'reserved',
  'in_progress',
  'succeeded',
  'failed_pre_provider',
  'ambiguous_provider',
  'failed_post_provider'
);
--> statement-breakpoint
CREATE TABLE "ai_tryon_budget_buckets" (
  "period" text PRIMARY KEY NOT NULL,
  "limit_micro_usd" bigint NOT NULL,
  "reserved_micro_usd" bigint DEFAULT 0 NOT NULL,
  "settled_micro_usd" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_tryon_budget_buckets_period_format" CHECK ("ai_tryon_budget_buckets"."period" ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT "ai_tryon_budget_buckets_amounts_non_negative" CHECK ("ai_tryon_budget_buckets"."limit_micro_usd" >= 0 AND "ai_tryon_budget_buckets"."reserved_micro_usd" >= 0 AND "ai_tryon_budget_buckets"."settled_micro_usd" >= 0),
  CONSTRAINT "ai_tryon_budget_buckets_within_limit" CHECK ("ai_tryon_budget_buckets"."reserved_micro_usd" + "ai_tryon_budget_buckets"."settled_micro_usd" <= "ai_tryon_budget_buckets"."limit_micro_usd")
);
--> statement-breakpoint
CREATE TABLE "ai_tryon_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "idempotency_hash" text NOT NULL,
  "session_tag" text NOT NULL,
  "budget_period" text NOT NULL,
  "product_id" uuid,
  "background" text NOT NULL,
  "provider" text NOT NULL,
  "requested_model" text NOT NULL,
  "served_model" text,
  "prompt_version" text NOT NULL,
  "engine_version" text NOT NULL,
  "output_version" text NOT NULL,
  "regeneration" boolean DEFAULT false NOT NULL,
  "status" "ai_tryon_request_status" DEFAULT 'reserved' NOT NULL,
  "reserved_micro_usd" bigint NOT NULL,
  "actual_micro_usd" bigint,
  "latency_ms" integer,
  "output_byte_size" integer,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "ai_tryon_requests_budget_period_format" CHECK ("ai_tryon_requests"."budget_period" ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT "ai_tryon_requests_costs_non_negative" CHECK ("ai_tryon_requests"."reserved_micro_usd" >= 0 AND ("ai_tryon_requests"."actual_micro_usd" IS NULL OR "ai_tryon_requests"."actual_micro_usd" >= 0)),
  CONSTRAINT "ai_tryon_requests_metrics_positive" CHECK (("ai_tryon_requests"."latency_ms" IS NULL OR "ai_tryon_requests"."latency_ms" >= 0) AND ("ai_tryon_requests"."output_byte_size" IS NULL OR "ai_tryon_requests"."output_byte_size" > 0)),
  CONSTRAINT "ai_tryon_requests_known_background" CHECK ("ai_tryon_requests"."background" IN ('studio', 'festival', 'wedding', 'party', 'birthday'))
);
--> statement-breakpoint
ALTER TABLE "ai_tryon_requests" ADD CONSTRAINT "ai_tryon_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tryon_requests_request_id_unique" ON "ai_tryon_requests" USING btree ("request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tryon_requests_idempotency_hash_unique" ON "ai_tryon_requests" USING btree ("idempotency_hash");
--> statement-breakpoint
CREATE INDEX "ai_tryon_requests_session_created_idx" ON "ai_tryon_requests" USING btree ("session_tag", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_tryon_requests_product_created_idx" ON "ai_tryon_requests" USING btree ("product_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_tryon_requests_budget_status_created_idx" ON "ai_tryon_requests" USING btree ("budget_period", "status", "created_at");
--> statement-breakpoint
CREATE FUNCTION "public"."ftt_ai_tryon_reconcile_stale"(
  p_period text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released bigint := 0;
  v_settled bigint := 0;
BEGIN
  -- The bucket is always locked before request rows, matching finalization.
  PERFORM 1 FROM "public"."ai_tryon_budget_buckets"
    WHERE "period" = p_period
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  WITH stale AS (
    SELECT "id", "status", "reserved_micro_usd"
      FROM "public"."ai_tryon_requests"
      WHERE "budget_period" = p_period
        AND "status" IN ('reserved', 'in_progress')
        AND "created_at" < now() - INTERVAL '10 minutes'
      ORDER BY "created_at", "id"
      FOR UPDATE
  ), reconciled AS (
    UPDATE "public"."ai_tryon_requests" AS request
      SET "status" = CASE
            WHEN stale."status" = 'reserved'
              THEN 'failed_pre_provider'::"public"."ai_tryon_request_status"
            ELSE 'ambiguous_provider'::"public"."ai_tryon_request_status"
          END,
          "actual_micro_usd" = CASE
            WHEN stale."status" = 'reserved' THEN 0
            ELSE stale."reserved_micro_usd"
          END,
          "error_code" = CASE
            WHEN stale."status" = 'reserved'
              THEN 'INVOCATION_EXPIRED_PRE_PROVIDER'
            ELSE 'PROVIDER_TIMEOUT'
          END,
          "completed_at" = now()
      FROM stale
      WHERE request."id" = stale."id"
      RETURNING stale."status" AS previous_status,
        stale."reserved_micro_usd" AS reservation
  )
  SELECT
    COALESCE(SUM(reservation), 0),
    COALESCE(
      SUM(CASE WHEN previous_status = 'in_progress' THEN reservation ELSE 0 END),
      0
    )
    INTO v_released, v_settled
    FROM reconciled;

  IF v_released > 0 THEN
    UPDATE "public"."ai_tryon_budget_buckets"
      SET "reserved_micro_usd" = "reserved_micro_usd" - v_released,
          "settled_micro_usd" = "settled_micro_usd" + v_settled,
          "updated_at" = now()
      WHERE "period" = p_period;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."ftt_ai_tryon_reserve"(
  p_period text,
  p_limit_micro_usd bigint,
  p_request_id uuid,
  p_idempotency_hash text,
  p_session_tag text,
  p_background text,
  p_provider text,
  p_requested_model text,
  p_prompt_version text,
  p_engine_version text,
  p_output_version text,
  p_regeneration boolean,
  p_forecast_micro_usd bigint
) RETURNS TABLE(outcome text, request_id uuid, request_status "public"."ai_tryon_request_status")
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted_id uuid;
  v_existing_request_id uuid;
  v_existing_period text;
  v_existing_status "public"."ai_tryon_request_status";
  v_limit bigint;
  v_reserved bigint;
  v_settled bigint;
BEGIN
  IF p_limit_micro_usd < 0 OR p_forecast_micro_usd <= 0 THEN
    RETURN QUERY SELECT 'invalid_amount'::text, NULL::uuid, NULL::"public"."ai_tryon_request_status";
    RETURN;
  END IF;

  -- Reconcile an existing action in its original budget period first. The
  -- unique idempotency row is retained, so no stale action is retried.
  SELECT existing_request."budget_period"
    INTO v_existing_period
    FROM "public"."ai_tryon_requests" AS existing_request
    WHERE existing_request."idempotency_hash" = p_idempotency_hash;
  IF FOUND THEN
    PERFORM "public"."ftt_ai_tryon_reconcile_stale"(v_existing_period);
    SELECT existing_request."request_id", existing_request."status"
      INTO v_existing_request_id, v_existing_status
      FROM "public"."ai_tryon_requests" AS existing_request
      WHERE existing_request."idempotency_hash" = p_idempotency_hash
      FOR UPDATE;
    IF FOUND THEN
      RETURN QUERY SELECT 'duplicate'::text, v_existing_request_id, v_existing_status;
      RETURN;
    END IF;
  END IF;

  INSERT INTO "public"."ai_tryon_budget_buckets" (
    "period", "limit_micro_usd", "reserved_micro_usd", "settled_micro_usd"
  ) VALUES (p_period, p_limit_micro_usd, 0, 0)
  ON CONFLICT ("period") DO NOTHING;

  -- Recovers reservations left behind by a terminated serverless invocation.
  -- Provider-started work settles at the full forecast and remains ambiguous.
  PERFORM "public"."ftt_ai_tryon_reconcile_stale"(p_period);

  SELECT "limit_micro_usd", "reserved_micro_usd", "settled_micro_usd"
    INTO v_limit, v_reserved, v_settled
    FROM "public"."ai_tryon_budget_buckets"
    WHERE "period" = p_period
    FOR UPDATE;

  SELECT existing_request."request_id", existing_request."status"
    INTO v_existing_request_id, v_existing_status
    FROM "public"."ai_tryon_requests" AS existing_request
    WHERE existing_request."idempotency_hash" = p_idempotency_hash
    FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT 'duplicate'::text, v_existing_request_id, v_existing_status;
    RETURN;
  END IF;

  IF v_limit <> p_limit_micro_usd THEN
    RETURN QUERY SELECT 'configuration_mismatch'::text, NULL::uuid, NULL::"public"."ai_tryon_request_status";
    RETURN;
  END IF;
  IF v_settled + v_reserved + p_forecast_micro_usd > v_limit THEN
    RETURN QUERY SELECT 'budget_exhausted'::text, NULL::uuid, NULL::"public"."ai_tryon_request_status";
    RETURN;
  END IF;

  INSERT INTO "public"."ai_tryon_requests" (
    "request_id", "idempotency_hash", "session_tag", "budget_period",
    "background", "provider", "requested_model", "prompt_version",
    "engine_version", "output_version", "regeneration", "status",
    "reserved_micro_usd"
  ) VALUES (
    p_request_id, p_idempotency_hash, p_session_tag, p_period,
    p_background, p_provider, p_requested_model, p_prompt_version,
    p_engine_version, p_output_version, p_regeneration, 'reserved',
    p_forecast_micro_usd
  )
  ON CONFLICT ("idempotency_hash") DO NOTHING
  RETURNING "id" INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT existing_request."request_id", existing_request."status"
      INTO v_existing_request_id, v_existing_status
      FROM "public"."ai_tryon_requests" AS existing_request
      WHERE existing_request."idempotency_hash" = p_idempotency_hash
      FOR UPDATE;
    RETURN QUERY SELECT 'duplicate'::text, v_existing_request_id, v_existing_status;
    RETURN;
  END IF;

  UPDATE "public"."ai_tryon_budget_buckets"
    SET "reserved_micro_usd" = "reserved_micro_usd" + p_forecast_micro_usd,
        "updated_at" = now()
    WHERE "period" = p_period;

  RETURN QUERY SELECT 'reserved'::text, p_request_id, 'reserved'::"public"."ai_tryon_request_status";
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."ftt_ai_tryon_finalize"(
  p_request_id uuid,
  p_status "public"."ai_tryon_request_status",
  p_actual_micro_usd bigint,
  p_served_model text,
  p_latency_ms integer,
  p_output_byte_size integer,
  p_error_code text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period text;
  v_reserved bigint;
  v_settle bigint;
  v_current_status "public"."ai_tryon_request_status";
BEGIN
  IF p_status NOT IN ('succeeded', 'failed_pre_provider', 'ambiguous_provider', 'failed_post_provider') THEN
    RETURN false;
  END IF;

  SELECT "budget_period"
    INTO v_period
    FROM "public"."ai_tryon_requests"
    WHERE "request_id" = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1 FROM "public"."ai_tryon_budget_buckets"
    WHERE "period" = v_period
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT "reserved_micro_usd", "status"
    INTO v_reserved, v_current_status
    FROM "public"."ai_tryon_requests"
    WHERE "request_id" = p_request_id
      AND "budget_period" = v_period
    FOR UPDATE;
  IF NOT FOUND OR v_current_status NOT IN ('reserved', 'in_progress') THEN
    RETURN false;
  END IF;

  v_settle := CASE
    WHEN p_status = 'failed_pre_provider' THEN 0
    WHEN p_actual_micro_usd IS NULL THEN v_reserved
    ELSE p_actual_micro_usd
  END;
  IF v_settle < 0 OR v_settle > v_reserved THEN RETURN false; END IF;

  UPDATE "public"."ai_tryon_budget_buckets"
    SET "reserved_micro_usd" = "reserved_micro_usd" - v_reserved,
        "settled_micro_usd" = "settled_micro_usd" + v_settle,
        "updated_at" = now()
    WHERE "period" = v_period;

  UPDATE "public"."ai_tryon_requests"
    SET "status" = p_status,
        "served_model" = p_served_model,
        "actual_micro_usd" = v_settle,
        "latency_ms" = p_latency_ms,
        "output_byte_size" = p_output_byte_size,
        "error_code" = p_error_code,
        "completed_at" = now()
    WHERE "request_id" = p_request_id;
  RETURN true;
END;
$$;
