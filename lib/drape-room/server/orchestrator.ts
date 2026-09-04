import { randomUUID } from "node:crypto";

import { tryonErrorResponse } from "@/lib/drape-room/http/errors";
import {
  bindTryonRequestProduct,
  finalizeTryonBudget,
  markTryonProviderDispatchAttempted,
  reserveTryonBudget,
  type BudgetReservation,
  type FinalizeTryonBudgetInput,
} from "@/lib/drape-room/ledger/budget";
import { admitTryonRequest } from "@/lib/drape-room/server/admission";
import {
  createTryonInvocationDeadline,
  type TryonInvocationDeadline,
} from "@/lib/drape-room/server/deadline";
import { generateClassicNiviDrape } from "@/lib/drape-room/server/generate";
import {
  currentTryonTraceId,
  observeTryonFailed,
  observeTryonFailure,
  observeTryonRejection,
  observeTryonStage,
  observeTryonSucceeded,
  withTryonObservability,
  withTryonTraceHeader,
} from "@/lib/drape-room/server/observability";
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  DrapeProviderError,
  type SupportedImageMimeType,
  type TryOnGarmentReferences,
} from "@/lib/drape-room/server/provider";
import {
  claimProductDailyQuota,
  type ProductDailyQuota,
} from "@/lib/drape-room/security/product-daily-quota";
import {
  checkProductAdmissionGuard,
  recordInvalidProductAdmission,
} from "@/lib/drape-room/security/product-admission-guard";
import {
  checkProviderCircuit,
  isProviderCircuitFailure,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
  releaseProviderCircuitProbe,
  type ProviderCircuitProbe,
} from "@/lib/drape-room/security/provider-circuit-breaker";
import { checkTryonGlobalRateAdmission } from "@/lib/drape-room/security/rate-admission";
import {
  acquireTryonGenerationLeaseDetailed,
  type TryonGenerationLease,
} from "@/lib/drape-room/security/redis-guard";
import { releaseTryonLeaseObserved } from "@/lib/drape-room/server/lease-cleanup";
import {
  defaultLoadProduct,
  safeTryonHeaderValue,
  utcBudgetPeriod,
  type LoadedTryonProduct,
  type TryonGenerateDependencies,
} from "@/lib/drape-room/server/route-contract";
import {
  productFailure,
  reservationFailure,
  responseForUnknown,
  settlementFor,
  TryonRouteError,
} from "@/lib/drape-room/server/route-errors";
import {
  rawTryonImageResponse,
  tryonDailyQuotaHeaders,
} from "@/lib/drape-room/server/route-response";

export type { TryonGenerateDependencies } from "@/lib/drape-room/server/route-contract";

/**
 * Small paid-generation coordinator. Admission, error mapping, provider
 * adapters, image validation, and response construction remain cohesive units.
 */
export function handleTryonGenerateRequest(
  request: Request,
  dependencies: TryonGenerateDependencies = {},
): Promise<Response> {
  return withTryonObservability(
    () => handleObservedTryonGenerateRequest(request, dependencies),
    dependencies.now ?? Date.now,
  );
}

async function handleObservedTryonGenerateRequest(
  request: Request,
  dependencies: TryonGenerateDependencies,
): Promise<Response> {
  let deadline: TryonInvocationDeadline | null = null;
  let admitted;
  try {
    deadline = createTryonInvocationDeadline({
      now: dependencies.now ?? Date.now,
      upstreamSignal: request.signal,
    });
    admitted = await admitTryonRequest(request, dependencies, deadline);
  } catch (error) {
    deadline?.dispose();
    const failure = responseForUnknown(error);
    observeTryonFailed(failure.code, failure.status, { stage: "admission" });
    return tryonErrorResponse(
      failure.code,
      failure.status,
      withTryonTraceHeader(failure.headers),
    );
  }

  const {
    config,
    idempotencyHash,
    ipTag,
    parsed,
    provider,
    redis,
    sessionTag,
  } = admitted;
  observeTryonStage(
    "admission_complete",
    {
      model: config.model,
      productId: parsed.productId,
      provider: config.provider,
    },
  );
  let product: LoadedTryonProduct | null = null;
  let outputBytes: Uint8Array | null = null;
  let dailyQuota: ProductDailyQuota | null = null;
  let dailyQuotaReleaseBeforeProvider: (() => Promise<void>) | null = null;
  let forecastMicroUsd: number | null = null;
  let lease: TryonGenerationLease | null = null;
  let ledgerRequestId: string | null = null;
  let providerCircuitProbe: ProviderCircuitProbe | undefined;
  let providerCircuitResolved = false;
  let providerDispatchAttempted = false;
  let settlementAttempted = false;
  let settlementComplete = false;
  let servedModel: string | null = null;
  let providerLatencyMs: number | null = null;
  let stage = "product_load";

  const settle = async (
    input: Omit<FinalizeTryonBudgetInput, "requestId">,
  ): Promise<boolean> => {
    if (!ledgerRequestId) return false;
    const requestId = ledgerRequestId;
    if (settlementAttempted) return false;
    settlementAttempted = true;
    observeTryonStage("ledger_settlement_started", {
      ledgerRequestId,
      providerDispatchAttempted,
      status: input.status,
    });
    const finalized = await deadline.runBeforeSettlementDeadline(() =>
      (dependencies.finalizeBudget ?? finalizeTryonBudget)({
        ...input,
        requestId,
      }),
    );
    settlementComplete = finalized;
    observeTryonStage(
      "ledger_settlement_finished",
      {
        finalized,
        ledgerRequestId,
        status: input.status,
      },
      finalized ? "debug" : "warn",
    );
    return finalized;
  };

  try {
    deadline.assertWorkAvailable();
    stage = "product_admission_guard";
    try {
      const guard = await deadline.runBeforeWorkDeadline(() =>
        (
          dependencies.checkProductAdmissionGuard ??
          checkProductAdmissionGuard
        )(redis, ipTag),
      );
      if (!guard.allowed) {
        throw new TryonRouteError("TRYON_RATE_LIMITED", 429, {
          "Retry-After": String(guard.retryAfterSeconds),
        });
      }
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      if (error instanceof TryonRouteError) throw error;
      observeTryonFailure(stage, error);
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("product_admission_guard_clear");

    stage = "product_load";
    observeTryonStage("product_load_started", { productId: parsed.productId });
    try {
      product = await deadline.runBeforeWorkDeadline(() =>
        (dependencies.loadProduct ?? defaultLoadProduct)(
          parsed.productId,
          deadline.signal,
        ),
      );
    } catch (error) {
      if (deadline.signal.aborted) deadline.assertWorkAvailable();
      observeTryonFailure(stage, error, { productId: parsed.productId });
      const productError =
        productFailure(error) ??
        new TryonRouteError("REFERENCE_UNAVAILABLE", 422);
      if (
        productError.code === "PRODUCT_NOT_FOUND" ||
        productError.code === "PRODUCT_NOT_ELIGIBLE"
      ) {
        try {
          const retryAfterSeconds = await deadline.runBeforeSettlementDeadline(
            () =>
              (
                dependencies.recordInvalidProductAdmission ??
                recordInvalidProductAdmission
              )(redis, ipTag),
          );
          observeTryonStage("invalid_product_admission_recorded", {
            blocked: retryAfterSeconds > 0,
          });
        } catch (guardError) {
          observeTryonFailure("invalid_product_admission_record", guardError);
        }
      }
      throw productError;
    }
    if (!product) throw new TryonRouteError("REFERENCE_UNAVAILABLE", 422);
    const loadedProduct = product;
    observeTryonStage(
      "product_reference_loaded",
      {
        productId: parsed.productId,
        referenceBytes: loadedProduct.references.map(
          (reference) => reference.bytes.byteLength,
        ),
        referenceMimeTypes: loadedProduct.references.map(
          (reference) => reference.mimeType,
        ),
        referenceVersions: loadedProduct.references.map(
          (reference) => reference.version,
        ),
        referenceCount: loadedProduct.references.length + 1,
        referenceMode:
          loadedProduct.references.length === 1 ? "single" : "dual",
      },
    );
    deadline.assertWorkAvailable();
    stage = "product_reference_contract";
    if (
      (loadedProduct.references.length !== 1 &&
        loadedProduct.references.length !== 2) ||
      loadedProduct.references.some(
        (reference) =>
          !SUPPORTED_IMAGE_MIME_TYPES.includes(
            reference.mimeType as SupportedImageMimeType,
          ) || !safeTryonHeaderValue(reference.version),
      ) ||
      !safeTryonHeaderValue(loadedProduct.saree.productReferenceVersion)
    ) {
      throw new TryonRouteError("REFERENCE_UNAVAILABLE", 422);
    }
    observeTryonStage("product_reference_verified");
    deadline.assertWorkAvailable();
    const referenceMode =
      loadedProduct.references.length === 1 ? "single" : "dual";
    const totalReferenceCount =
      loadedProduct.references.length === 1 ? 2 : 3;
    const productReferences: TryOnGarmentReferences =
      loadedProduct.references.length === 1
        ? [
            {
              bytes: loadedProduct.references[0].bytes,
              mimeType: loadedProduct.references[0]
                .mimeType as SupportedImageMimeType,
            },
          ]
        : [
            {
              bytes: loadedProduct.references[0].bytes,
              mimeType: loadedProduct.references[0]
                .mimeType as SupportedImageMimeType,
            },
            {
              bytes: loadedProduct.references[1].bytes,
              mimeType: loadedProduct.references[1]
                .mimeType as SupportedImageMimeType,
            },
          ];

    stage = "generation";
    const generated = await deadline.runBeforeWorkDeadline(() =>
      generateClassicNiviDrape(provider, {
        background: parsed.background,
        beforeProviderCall: async ({ costReservation, referenceCount }) => {
          const modeForecastMicroUsd = costReservation.microUsd;
          if (
            !Number.isSafeInteger(modeForecastMicroUsd) ||
            modeForecastMicroUsd <= 0
          ) {
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          forecastMicroUsd = modeForecastMicroUsd;
          observeTryonStage("mode_aware_cost_estimate_ready", {
            forecastMicroUsd: modeForecastMicroUsd,
            referenceCount,
          });
          // This hook runs only after the subject/product images and prompt are
          // normalized. Scarce global controls and cost accounting stay next
          // to the single adapter-dispatch boundary.
          stage = "provider_circuit_admission";
          try {
            const circuit = await deadline.runBeforeWorkDeadline(() =>
              (dependencies.checkProviderCircuit ?? checkProviderCircuit)(
                redis,
                config.provider,
                config.model,
              ),
            );
            if (!circuit.allowed) {
              throw new TryonRouteError("PROVIDER_UNAVAILABLE", 503, {
                "Retry-After": String(circuit.retryAfterSeconds),
              });
            }
            providerCircuitProbe = circuit.probe;
          } catch (error) {
            if (deadline.signal.aborted) deadline.assertWorkAvailable();
            if (error instanceof TryonRouteError) throw error;
            observeTryonFailure(stage, error);
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          observeTryonStage(
            providerCircuitProbe
              ? "provider_circuit_half_open_probe_acquired"
              : "provider_circuit_closed",
          );

          stage = "global_rate_limit_admission";
          try {
            const globalRate = await deadline.runBeforeWorkDeadline(() =>
              (
                dependencies.checkGlobalRateAdmission ??
                checkTryonGlobalRateAdmission
              )(),
            );
            if (!globalRate.allowed) {
              throw new TryonRouteError("TRYON_RATE_LIMITED", 429, {
                "Retry-After": String(globalRate.retryAfterSeconds),
              });
            }
          } catch (error) {
            if (deadline.signal.aborted) deadline.assertWorkAvailable();
            if (error instanceof TryonRouteError) throw error;
            observeTryonFailure(stage, error);
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          observeTryonStage("global_rate_limit_admitted");

          stage = "redis_lease";
          try {
            const leaseAdmission = await deadline.runBeforeWorkDeadline(() =>
              (
                dependencies.acquireLease ??
                acquireTryonGenerationLeaseDetailed
              )(
                redis,
                sessionTag,
                deadline.redisLeaseMs(),
                (dependencies.now ?? Date.now)(),
              ),
            );
            if (!leaseAdmission.acquired) {
              throw leaseAdmission.reason === "session"
                ? new TryonRouteError("TRYON_ALREADY_PROCESSING", 409)
                : new TryonRouteError("TRYON_RATE_LIMITED", 429, {
                    "Retry-After": "5",
                  });
            }
            lease = leaseAdmission.lease;
          } catch (error) {
            if (deadline.signal.aborted) deadline.assertWorkAvailable();
            if (error instanceof TryonRouteError) throw error;
            observeTryonFailure(stage, error);
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          observeTryonStage("redis_lease_acquired");

          const candidateRequestId =
            (dependencies.createRequestId ?? randomUUID)();

          stage = "product_daily_quota";
          let quotaClaim;
          try {
            quotaClaim = await deadline.runBeforeWorkDeadline(() =>
              (
                dependencies.claimProductDailyQuota ??
                claimProductDailyQuota
              )(
                redis,
                ipTag,
                parsed.productId,
                candidateRequestId,
                (dependencies.now ?? Date.now)(),
              ),
            );
          } catch (error) {
            if (deadline.signal.aborted) deadline.assertWorkAvailable();
            observeTryonFailure(stage, error, {
              ledgerRequestId,
              productId: parsed.productId,
            });
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          if (!quotaClaim.allowed) {
            observeTryonRejection(
              stage,
              "TRYON_PRODUCT_DAILY_LIMIT",
              429,
              {
                dayKey: quotaClaim.quota.dayKey,
                remaining: quotaClaim.quota.remaining,
                used: quotaClaim.quota.used,
              },
            );
            const headers = tryonDailyQuotaHeaders(quotaClaim.quota);
            headers.set(
              "Retry-After",
              String(quotaClaim.retryAfterSeconds),
            );
            throw new TryonRouteError(
              "TRYON_PRODUCT_DAILY_LIMIT",
              429,
              headers,
            );
          }
          dailyQuota = quotaClaim.quota;
          dailyQuotaReleaseBeforeProvider = quotaClaim.releaseBeforeProvider;
          observeTryonStage(
            "product_daily_quota_claimed",
            {
              dayKey: quotaClaim.quota.dayKey,
              remaining: quotaClaim.quota.remaining,
              used: quotaClaim.quota.used,
            },
          );

          stage = "budget_reservation";
          observeTryonStage("budget_reservation_started", {
            forecastMicroUsd,
            period: utcBudgetPeriod((dependencies.now ?? Date.now)()),
          });
          let reservation: BudgetReservation;
          try {
            reservation = await deadline.runBeforeWorkDeadline(() =>
              (dependencies.reserveBudget ?? reserveTryonBudget)({
                background: parsed.background,
                engineVersion: config.engineVersion,
                forecastMicroUsd: modeForecastMicroUsd,
                idempotencyHash,
                limitMicroUsd: config.monthlyLimitMicroUsd,
                outputVersion: config.outputVersion,
                period: utcBudgetPeriod((dependencies.now ?? Date.now)()),
                promptVersion: config.promptVersion,
                provider: config.provider,
                requestedModel: config.model,
                requestId: candidateRequestId,
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
          const reservedRequestId = reservation.requestId;
          ledgerRequestId = reservedRequestId;
          observeTryonStage("budget_reserved", { ledgerRequestId });

          stage = "ledger_product_binding";
          if (
            !(await deadline.runBeforeWorkDeadline(() =>
              (dependencies.bindProduct ?? bindTryonRequestProduct)({
                productId: parsed.productId,
                productReferenceVersion:
                  loadedProduct.saree.productReferenceVersion,
                referenceContractVersion: config.referenceContractVersion,
                referenceCount: totalReferenceCount,
                referenceMode,
                requestId: reservedRequestId,
              }),
            ))
          ) {
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          observeTryonStage("ledger_product_bound");

          stage = "provider_dispatch_accounting";
          const marked = await deadline.runBeforeWorkDeadline(() =>
            (
              dependencies.markProviderDispatchAttempted ??
              markTryonProviderDispatchAttempted
            )(reservedRequestId),
          );
          if (!marked) {
            throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
          }
          await quotaClaim.commitProviderDispatchAttempted();
          dailyQuotaReleaseBeforeProvider = null;
          providerDispatchAttempted = true;
          // This durable transition means the application is about to invoke
          // the adapter. It does not claim provider receipt or acceptance.
          observeTryonStage(
            "provider_dispatch_accounting_committed",
            {
              ledgerRequestId,
              model: config.model,
              provider: config.provider,
            },
          );
        },
        model: config.model,
        products: productReferences,
        signal: deadline.signal,
        subject: { bytes: parsed.photo, mimeType: parsed.photoMimeType },
      }),
    );
    outputBytes = generated.image.bytes;
    servedModel = generated.servedModel;
    providerLatencyMs = generated.latencyMs;
    try {
      await deadline.runBeforeSettlementDeadline(() =>
        (
          dependencies.recordProviderCircuitSuccess ??
          recordProviderCircuitSuccess
        )(redis, config.provider, config.model, providerCircuitProbe),
      );
      providerCircuitResolved = true;
      observeTryonStage("provider_circuit_success_recorded");
    } catch (circuitError) {
      observeTryonFailure("provider_circuit_success_record", circuitError);
    }
    if (!dailyQuota || !ledgerRequestId) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage(
      "generation_complete",
      {
        latencyMs: generated.latencyMs,
        outputBytes: generated.image.bytes.byteLength,
        providerReportedUsage: generated.usage.providerReported,
        servedModel: generated.servedModel,
      },
    );

    // Build and fully validate transport metadata before committing success.
    stage = "response_construction";
    const response = rawTryonImageResponse({
      bytes: generated.image.bytes,
      dailyQuota,
      engineVersion: config.engineVersion,
      // Browser cache identity follows the configured model alias. Providers
      // may return a more specific deployment/version string on each call;
      // that value is still retained in the metadata ledger below, but using
      // it as the public cache key would make the saved render unreachable
      // after a reload when public config again exposes the configured alias.
      model: config.model,
      outputVersion: config.outputVersion,
      productReferenceVersion: loadedProduct.saree.productReferenceVersion,
      promptVersion: generated.promptVersion,
      referenceContractVersion: config.referenceContractVersion,
      provider: config.provider,
      requestId: ledgerRequestId,
    });
    const traceId = currentTryonTraceId();
    if (traceId) response.headers.set("X-FTT-Tryon-Trace-Id", traceId);
    if (forecastMicroUsd === null) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    const reportedCost = generated.usage.actualMicroUsd;
    const actualMicroUsd =
      generated.usage.providerReported &&
      reportedCost !== null &&
      Number.isSafeInteger(reportedCost) &&
      reportedCost >= 0 &&
      reportedCost <= forecastMicroUsd
        ? reportedCost
        : null;
    if (
      !(await settle({
        actualMicroUsd,
        errorCode: null,
        latencyMs: generated.latencyMs,
        outputByteSize: generated.image.bytes.byteLength,
        servedModel: generated.servedModel,
        status: "succeeded",
      }))
    ) {
      throw new TryonRouteError("UNKNOWN", 500);
    }
    observeTryonSucceeded({
      latencyMs: generated.latencyMs,
      ledgerRequestId,
      model: config.model,
      outputBytes: generated.image.bytes.byteLength,
      productId: parsed.productId,
      provider: config.provider,
      servedModel: generated.servedModel,
      status: response.status,
    });
    return response;
  } catch (error) {
    let failure = responseForUnknown(error);
    if (!providerDispatchAttempted && dailyQuotaReleaseBeforeProvider) {
      const releaseDailyQuota = dailyQuotaReleaseBeforeProvider;
      try {
        await deadline.runBeforeSettlementDeadline(releaseDailyQuota);
        dailyQuotaReleaseBeforeProvider = null;
        dailyQuota = null;
        observeTryonStage("product_daily_quota_released", {
          ledgerRequestId,
          productId: parsed.productId,
        });
      } catch (releaseError) {
        observeTryonFailure("product_daily_quota_release", releaseError, {
          ledgerRequestId,
          productId: parsed.productId,
        });
      }
    }
    if (
      providerDispatchAttempted &&
      error instanceof DrapeProviderError &&
      isProviderCircuitFailure(error.code)
    ) {
      const providerErrorCode = error.code;
      try {
        const retryAfterSeconds = await deadline.runBeforeSettlementDeadline(
          () =>
            (
              dependencies.recordProviderCircuitFailure ??
              recordProviderCircuitFailure
            )(
              redis,
              config.provider,
              config.model,
              providerErrorCode,
              providerCircuitProbe,
            ),
        );
        providerCircuitResolved = true;
        observeTryonStage("provider_circuit_failure_recorded", {
          circuitOpened: retryAfterSeconds > 0,
          providerErrorCode,
        });
      } catch (circuitError) {
        observeTryonFailure("provider_circuit_failure_record", circuitError, {
          providerErrorCode,
        });
      }
    } else if (
      providerDispatchAttempted &&
      (failure.code === "OUTPUT_INVALID" ||
        (error instanceof DrapeProviderError &&
          (error.code === "invalid_request" ||
            error.code === "safety_rejected")))
    ) {
      try {
        if (failure.code === "OUTPUT_INVALID") {
          await deadline.runBeforeSettlementDeadline(() =>
            (
              dependencies.recordProviderCircuitFailure ??
              recordProviderCircuitFailure
            )(
              redis,
              config.provider,
              config.model,
              "invalid_response",
              providerCircuitProbe,
            ),
          );
        } else {
          await deadline.runBeforeSettlementDeadline(() =>
            (
              dependencies.recordProviderCircuitSuccess ??
              recordProviderCircuitSuccess
            )(redis, config.provider, config.model, providerCircuitProbe),
          );
        }
        providerCircuitResolved = true;
      } catch (circuitError) {
        observeTryonFailure("provider_circuit_result_record", circuitError);
      }
    }
    // Expected 4xx rejections already carry their reason on the terminal
    // outcome line; only server faults deserve a stack and an error-tracker
    // capture here. The mapped public status is the test, not the error class:
    // DrapeProviderError and DrapeReferenceValidationError are ordinary errors
    // that still map to a client-side rejection.
    if (failure.status >= 500) {
      observeTryonFailure(stage, error, {
        ledgerRequestId,
        providerDispatchAttempted,
        publicCode: failure.code,
        publicStatus: failure.status,
        settlementAttempted,
      });
    }
    if (ledgerRequestId && !settlementAttempted) {
      try {
        if (providerDispatchAttempted) {
          const providerSettlement = settlementFor(error);
          failure = providerSettlement.publicError;
          await settle({
            actualMicroUsd: null,
            errorCode: failure.code,
            latencyMs: providerLatencyMs,
            outputByteSize: null,
            servedModel,
            status: providerSettlement.status,
          });
        } else {
          await settle({
            actualMicroUsd: 0,
            errorCode: failure.code,
            latencyMs: null,
            outputByteSize: null,
            servedModel: null,
            status: "failed_pre_provider",
          });
        }
      } catch (settlementError) {
        observeTryonFailure("ledger_failure_settlement", settlementError, {
          ledgerRequestId,
          providerDispatchAttempted,
        });
        failure = new TryonRouteError("UNKNOWN", 500);
      }
    }
    if (settlementAttempted && !settlementComplete) {
      failure = providerDispatchAttempted
        ? new TryonRouteError("PROVIDER_TIMEOUT", 504)
        : new TryonRouteError("UNKNOWN", 500);
    }
    observeTryonFailed(failure.code, failure.status, {
      ledgerRequestId,
      providerDispatchAttempted,
      settlementComplete,
      stage,
    });
    const failureHeaders = new Headers(failure.headers);
    if (providerDispatchAttempted && dailyQuota) {
      tryonDailyQuotaHeaders(dailyQuota).forEach((value, key) =>
        failureHeaders.set(key, value),
      );
    }
    return tryonErrorResponse(
      failure.code,
      failure.status,
      withTryonTraceHeader(failureHeaders),
    );
  } finally {
    parsed.photo.fill(0);
    product?.references.forEach((reference) => reference.bytes.fill(0));
    outputBytes?.fill(0);
    if (!providerDispatchAttempted && dailyQuotaReleaseBeforeProvider) {
      const releaseDailyQuota = dailyQuotaReleaseBeforeProvider;
      try {
        await deadline.runBeforeSettlementDeadline(releaseDailyQuota);
      } catch (error) {
        observeTryonFailure("product_daily_quota_release_cleanup", error, {
          ledgerRequestId,
          productId: parsed.productId,
        });
      }
    }
    if (lease) {
      await releaseTryonLeaseObserved(deadline, lease, { ledgerRequestId });
    }
    if (providerCircuitProbe && !providerCircuitResolved) {
      const probe = providerCircuitProbe;
      try {
        await deadline.runBeforeSettlementDeadline(() =>
          (
            dependencies.releaseProviderCircuitProbe ??
            releaseProviderCircuitProbe
          )(
            redis,
            config.provider,
            config.model,
            probe,
          ),
        );
        observeTryonStage("provider_circuit_probe_released");
      } catch (error) {
        observeTryonFailure("provider_circuit_probe_release", error);
      }
    }
    deadline.dispose();
    observeTryonStage("request_cleanup_complete");
  }
}
