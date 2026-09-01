import { randomUUID } from "node:crypto";

import {
  parseTryonMultipart,
  TryonMultipartError,
  type ParsedTryonMultipart,
} from "@/lib/drape-room/http/multipart";
import {
  reserveTryonBudget,
  type BudgetReservation,
} from "@/lib/drape-room/ledger/budget";
import {
  deriveTryonIdempotencyHash,
  deriveTryonIpTag,
} from "@/lib/drape-room/security/identities";
import {
  TRYON_CONSENT_TOKEN_HEADER,
  inspectTryonConsentToken,
} from "@/lib/drape-room/security/consent-token";
import { isStrictTryonOrigin } from "@/lib/drape-room/security/origin";
import {
  checkTryonRateAdmission,
  tryonRateLimitsReady,
} from "@/lib/drape-room/security/rate-admission";
import {
  acquireTryonGenerationLeaseDetailed,
  createTryonRedisClient,
  type TryonGenerationLease,
} from "@/lib/drape-room/security/redis-guard";
import {
  deriveTryonSessionTag,
  readTryonSessionCookie,
  verifyTryonSession,
} from "@/lib/drape-room/security/session";
import {
  readDrapeRoomConfig,
  type EnabledDrapeRoomConfig,
} from "@/lib/drape-room/server/config";
import type { TryonInvocationDeadline } from "@/lib/drape-room/server/deadline";
import { createConfiguredImageProvider } from "@/lib/drape-room/server/registry";
import {
  observeTryonFailure,
  observeTryonRejection,
  observeTryonStage,
} from "@/lib/drape-room/server/observability";
import {
  multipartFailure,
  reservationFailure,
  TryonRouteError,
} from "@/lib/drape-room/server/route-errors";
import {
  utcBudgetPeriod,
  type AdmittedTryonRequest,
  type TryonGenerateDependencies,
} from "@/lib/drape-room/server/route-contract";
import type { TryOnImageProvider } from "@/lib/drape-room/server/provider";

async function configuredProvider(
  config: EnabledDrapeRoomConfig,
  dependencies: TryonGenerateDependencies,
): Promise<{ provider: TryOnImageProvider; forecastMicroUsd: number }> {
  try {
    const provider = await (
      dependencies.createProvider ??
      ((enabledConfig) => createConfiguredImageProvider(enabledConfig))
    )(config);
    if (provider.id !== config.provider || !provider.supportsModel(config.model)) {
      throw new Error("provider_contract_mismatch");
    }
    const forecastMicroUsd = provider.estimateMaximumCost({
      imageSize: "1K",
      model: config.model,
      referenceCount: 3,
    }).microUsd;
    if (!Number.isSafeInteger(forecastMicroUsd) || forecastMicroUsd <= 0) {
      throw new Error("invalid_forecast");
    }
    return { forecastMicroUsd, provider };
  } catch (error) {
    observeTryonFailure("provider_configuration", error, {
      configuredModel: config.model,
      configuredProvider: config.provider,
    });
    throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
  }
}

/** Admission gates through one atomic metadata reservation; no provider call. */
export async function admitTryonRequest(
  request: Request,
  dependencies: TryonGenerateDependencies,
  deadline: TryonInvocationDeadline,
): Promise<AdmittedTryonRequest> {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now;
  let parsed: ParsedTryonMultipart | null = null;
  let lease: TryonGenerationLease | null = null;
  let stage = "deadline_check";
  let rejectionMeta: Record<string, unknown> | undefined;
  try {
    deadline.assertWorkAvailable();
    stage = "configuration";
    let config: EnabledDrapeRoomConfig;
    try {
      const loaded = (dependencies.readConfig ?? readDrapeRoomConfig)(env);
      if (!loaded.enabled) throw new TryonRouteError("TRYON_DISABLED", 503);
      config = loaded;
    } catch (error) {
      if (error instanceof TryonRouteError) throw error;
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage(
      "configuration_ready",
      {
        engineVersion: config.engineVersion,
        model: config.model,
        outputVersion: config.outputVersion,
        provider: config.provider,
        promptVersion: config.promptVersion,
      },
      "info",
    );

    stage = "origin_check";
    const originAllowed = isStrictTryonOrigin(request, config.allowedOrigins);
    if (!originAllowed) {
      throw new TryonRouteError("TRYON_FORBIDDEN_ORIGIN", 403);
    }
    observeTryonStage("origin_allowed");

    stage = "session_verification";
    const sessionNow = now();
    const session = verifyTryonSession(
      config.sessionSecret,
      readTryonSessionCookie(request, env.NODE_ENV),
      sessionNow,
    );
    if (!session) throw new TryonRouteError("TRYON_SESSION_REQUIRED", 401);
    observeTryonStage("session_verified");

    stage = "consent_verification";
    const consent = inspectTryonConsentToken(
      config,
      config.hmacSecret,
      session.nonce,
      request.headers.get(TRYON_CONSENT_TOKEN_HEADER),
      sessionNow,
    );
    if (!consent.valid) {
      rejectionMeta = { consentReason: consent.reason };
      throw new TryonRouteError("CONSENT_REQUIRED", 428);
    }
    observeTryonStage("consent_verified");

    stage = "multipart_parse";
    try {
      parsed = await deadline.runBeforeWorkDeadline(() =>
        (dependencies.parseMultipart ?? parseTryonMultipart)(
          request,
          deadline.signal,
        ),
      );
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      if (!(error instanceof TryonMultipartError)) {
        observeTryonFailure(stage, error);
      }
      throw error instanceof TryonMultipartError
        ? multipartFailure(error)
        : new TryonRouteError("PHOTO_INVALID", 400);
    }
    if (!parsed) throw new TryonRouteError("PHOTO_INVALID", 400);
    const requestInput = parsed;
    observeTryonStage(
      "multipart_ready",
      {
        background: requestInput.background,
        photoBytes: requestInput.photo.byteLength,
        photoMimeType: requestInput.photoMimeType,
        productId: requestInput.productId,
        regeneration: requestInput.regeneration,
      },
      "info",
    );
    deadline.assertWorkAvailable();

    stage = "identity_derivation";
    const sessionTag = deriveTryonSessionTag(config.hmacSecret, session.nonce);
    const ipTag = deriveTryonIpTag(request, config.ipHashSecret, env.NODE_ENV);
    if (!sessionTag || !ipTag) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("identities_ready");

    stage = "rate_limit_readiness";
    if (!(dependencies.rateLimitsReady ?? tryonRateLimitsReady)(env.NODE_ENV)) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("rate_limits_ready");

    stage = "rate_limit_admission";
    try {
      const rate = await deadline.runBeforeWorkDeadline(() =>
        (dependencies.checkRateAdmission ?? checkTryonRateAdmission)(
          sessionTag,
          ipTag,
        ),
      );
      if (!rate.allowed) {
        throw new TryonRouteError("TRYON_RATE_LIMITED", 429, {
          "Retry-After": String(rate.retryAfterSeconds),
        });
      }
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      if (error instanceof TryonRouteError) throw error;
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("rate_limit_admitted");

    stage = "provider_configuration";
    const { provider, forecastMicroUsd } = await deadline.runBeforeWorkDeadline(
      () => configuredProvider(config, dependencies),
    );
    observeTryonStage(
      "provider_ready",
      {
        forecastMicroUsd,
        model: config.model,
        provider: provider.id,
      },
      "info",
    );
    deadline.assertWorkAvailable();

    stage = "redis_client";
    let redis;
    try {
      redis = (dependencies.createRedisClient ?? createTryonRedisClient)();
    } catch (error) {
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    if (!redis) {
      observeTryonFailure(stage, new Error("durable_redis_not_configured"));
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("redis_client_ready");

    stage = "redis_lease";
    try {
      const admission = await deadline.runBeforeWorkDeadline(() =>
        (dependencies.acquireLease ?? acquireTryonGenerationLeaseDetailed)(
          redis,
          sessionTag,
          deadline.redisLeaseMs(),
          now(),
        ),
      );
      if (!admission.acquired) {
        throw admission.reason === "session"
          ? new TryonRouteError("TRYON_ALREADY_PROCESSING", 409)
          : new TryonRouteError("TRYON_RATE_LIMITED", 429, {
              "Retry-After": "5",
            });
      }
      lease = admission.lease;
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      if (error instanceof TryonRouteError) throw error;
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("redis_lease_acquired", undefined, "info");
    deadline.assertWorkAvailable();

    stage = "idempotency_derivation";
    const idempotencyHash = deriveTryonIdempotencyHash(
      config.hmacSecret,
      sessionTag,
      requestInput.idempotencyKey,
    );
    if (!idempotencyHash) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("idempotency_ready");
    deadline.assertWorkAvailable();

    stage = "budget_reservation";
    observeTryonStage("budget_reservation_started", {
      forecastMicroUsd,
      period: utcBudgetPeriod(now()),
    });
    let reservation: BudgetReservation;
    try {
      reservation = await deadline.runBeforeWorkDeadline(() =>
        (dependencies.reserveBudget ?? reserveTryonBudget)({
          background: requestInput.background,
          engineVersion: config.engineVersion,
          forecastMicroUsd,
          idempotencyHash,
          limitMicroUsd: config.monthlyLimitMicroUsd,
          outputVersion: config.outputVersion,
          period: utcBudgetPeriod(now()),
          promptVersion: config.promptVersion,
          provider: config.provider,
          regeneration: requestInput.regeneration,
          requestedModel: config.model,
          requestId: (dependencies.createRequestId ?? randomUUID)(),
          sessionTag,
        }),
      );
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    if (reservation.outcome !== "reserved" || !reservation.requestId) {
      observeTryonRejection(
        stage,
        reservation.outcome,
        reservation.outcome === "budget_exhausted" ? 503 : 409,
        { requestStatus: reservation.requestStatus },
      );
      throw reservationFailure(reservation);
    }
    observeTryonStage(
      "budget_reserved",
      { ledgerRequestId: reservation.requestId },
      "info",
    );
    return {
      config,
      forecastMicroUsd,
      ipTag,
      lease,
      ledgerRequestId: reservation.requestId,
      parsed: requestInput,
      provider,
      redis,
    };
  } catch (error) {
    observeTryonRejection(
      stage,
      error instanceof TryonRouteError ? error.code : "UNKNOWN",
      error instanceof TryonRouteError ? error.status : 500,
      rejectionMeta,
    );
    parsed?.photo.fill(0);
    if (lease) {
      const activeLease = lease;
      await deadline
        .runBeforeSettlementDeadline(() => activeLease.release())
        .catch(() => undefined);
    }
    throw error;
  }
}
