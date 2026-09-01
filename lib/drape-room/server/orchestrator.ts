import { tryonErrorResponse } from "@/lib/drape-room/http/errors";
import {
  bindTryonRequestProduct,
  finalizeTryonBudget,
  markTryonProviderStarted,
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
  observeTryonFailure,
  observeTryonRejection,
  observeTryonStage,
  withTryonObservability,
  withTryonTraceHeader,
} from "@/lib/drape-room/server/observability";
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from "@/lib/drape-room/server/provider";
import {
  claimProductDailyQuota,
  type ProductDailyQuota,
} from "@/lib/drape-room/security/product-daily-quota";
import {
  defaultLoadProduct,
  safeTryonHeaderValue,
  type LoadedTryonProduct,
  type TryonGenerateDependencies,
} from "@/lib/drape-room/server/route-contract";
import {
  productFailure,
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
    observeTryonRejection(
      "admission_response",
      failure.code,
      failure.status,
    );
    return tryonErrorResponse(
      failure.code,
      failure.status,
      withTryonTraceHeader(failure.headers),
    );
  }

  const {
    config,
    forecastMicroUsd,
    ipTag,
    lease,
    ledgerRequestId,
    parsed,
    provider,
    redis,
  } = admitted;
  observeTryonStage(
    "admission_complete",
    {
      forecastMicroUsd,
      ledgerRequestId,
      model: config.model,
      productId: parsed.productId,
      provider: config.provider,
    },
    "info",
  );
  let product: LoadedTryonProduct | null = null;
  let outputBytes: Uint8Array | null = null;
  let dailyQuota: ProductDailyQuota | null = null;
  let providerStarted = false;
  let settlementAttempted = false;
  let settlementComplete = false;
  let servedModel: string | null = null;
  let providerLatencyMs: number | null = null;
  let stage = "product_load";

  const settle = async (
    input: Omit<FinalizeTryonBudgetInput, "requestId">,
  ): Promise<boolean> => {
    if (settlementAttempted) return false;
    settlementAttempted = true;
    observeTryonStage("ledger_settlement_started", {
      ledgerRequestId,
      providerStarted,
      status: input.status,
    });
    const finalized = await deadline.runBeforeSettlementDeadline(() =>
      (dependencies.finalizeBudget ?? finalizeTryonBudget)({
        ...input,
        requestId: ledgerRequestId,
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
      finalized ? "info" : "warn",
    );
    return finalized;
  };

  try {
    deadline.assertWorkAvailable();
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
      throw (
        productFailure(error) ??
        new TryonRouteError("REFERENCE_UNAVAILABLE", 422)
      );
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
      },
      "info",
    );
    deadline.assertWorkAvailable();
    stage = "product_reference_contract";
    if (
      loadedProduct.references.length !== 2 ||
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

    stage = "ledger_product_binding";
    observeTryonStage("ledger_product_binding_started", {
      ledgerRequestId,
      productId: parsed.productId,
    });
    if (
      !(await deadline.runBeforeWorkDeadline(() =>
        (dependencies.bindProduct ?? bindTryonRequestProduct)(
          ledgerRequestId,
          parsed.productId,
        ),
      ))
    ) {
      throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
    }
    observeTryonStage("ledger_product_bound");
    deadline.assertWorkAvailable();

    stage = "generation";
    const generated = await deadline.runBeforeWorkDeadline(() =>
      generateClassicNiviDrape(provider, {
        background: parsed.background,
        beforeProviderCall: async () => {
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
                ledgerRequestId,
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
          observeTryonStage(
            "product_daily_quota_claimed",
            {
              dayKey: quotaClaim.quota.dayKey,
              remaining: quotaClaim.quota.remaining,
              used: quotaClaim.quota.used,
            },
            "info",
          );
          try {
            const marked = await deadline.runBeforeWorkDeadline(() =>
              (dependencies.markProviderStarted ?? markTryonProviderStarted)(
                ledgerRequestId,
              ),
            );
            if (!marked) {
              throw new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
            }
          } catch (error) {
            try {
              await deadline.runBeforeSettlementDeadline(() =>
                quotaClaim.releaseBeforeProvider(),
              );
              dailyQuota = null;
              observeTryonStage("product_daily_quota_released", {
                ledgerRequestId,
                productId: parsed.productId,
              });
            } catch (releaseError) {
              observeTryonFailure(
                "product_daily_quota_release",
                releaseError,
                { ledgerRequestId, productId: parsed.productId },
              );
            }
            throw error;
          }
          quotaClaim.commitProviderStarted();
          providerStarted = true;
          observeTryonStage(
            "provider_call_started",
            {
              ledgerRequestId,
              model: config.model,
              provider: config.provider,
            },
            "info",
          );
        },
        model: config.model,
        products: loadedProduct.references.map((reference) => ({
          bytes: reference.bytes,
          mimeType: reference.mimeType as SupportedImageMimeType,
        })) as [
          { bytes: Uint8Array; mimeType: SupportedImageMimeType },
          { bytes: Uint8Array; mimeType: SupportedImageMimeType },
        ],
        signal: deadline.signal,
        subject: { bytes: parsed.photo, mimeType: parsed.photoMimeType },
      }),
    );
    outputBytes = generated.image.bytes;
    servedModel = generated.servedModel;
    providerLatencyMs = generated.latencyMs;
    if (!dailyQuota) {
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
      "info",
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
      provider: config.provider,
      requestId: ledgerRequestId,
    });
    const traceId = currentTryonTraceId();
    if (traceId) response.headers.set("X-FTT-Tryon-Trace-Id", traceId);
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
    observeTryonStage(
      "request_succeeded",
      {
        ledgerRequestId,
        status: response.status,
      },
      "info",
    );
    return response;
  } catch (error) {
    let failure = responseForUnknown(error);
    observeTryonFailure(stage, error, {
      ledgerRequestId,
      providerStarted,
      publicCode: failure.code,
      publicStatus: failure.status,
      settlementAttempted,
    });
    if (!settlementAttempted) {
      try {
        if (providerStarted) {
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
          providerStarted,
        });
        failure = new TryonRouteError("UNKNOWN", 500);
      }
    }
    if (settlementAttempted && !settlementComplete) {
      failure = providerStarted
        ? new TryonRouteError("PROVIDER_TIMEOUT", 504)
        : new TryonRouteError("UNKNOWN", 500);
    }
    observeTryonRejection("error_response", failure.code, failure.status, {
      ledgerRequestId,
      providerStarted,
      settlementComplete,
    });
    const failureHeaders = new Headers(failure.headers);
    if (providerStarted && dailyQuota) {
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
    await deadline
      .runBeforeSettlementDeadline(() => lease.release())
      .then(() => observeTryonStage("redis_lease_released"))
      .catch((error) =>
        observeTryonFailure("redis_lease_release", error, {
          ledgerRequestId,
        }),
      );
    deadline.dispose();
    observeTryonStage("request_cleanup_complete");
  }
}
