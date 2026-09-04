import type { TryonPublicErrorCode } from "@/lib/drape-room/http/errors";
import { TryonMultipartError } from "@/lib/drape-room/http/multipart";
import type { BudgetReservation } from "@/lib/drape-room/ledger/budget";
import { DrapeReferenceValidationError } from "@/lib/drape-room/server/generate";
import { ImageValidationError } from "@/lib/drape-room/server/image-validation";
import { DrapeProviderError } from "@/lib/drape-room/server/provider";

export class TryonRouteError extends Error {
  constructor(
    readonly code: TryonPublicErrorCode,
    readonly status: number,
    readonly headers?: HeadersInit,
  ) {
    super(code);
    this.name = "TryonRouteError";
  }
}

export function multipartFailure(error: TryonMultipartError): TryonRouteError {
  if (error.code === "TRYON_INVALID_PHOTO") {
    return new TryonRouteError(
      error.status === 413 ? "PHOTO_TOO_LARGE" : "PHOTO_INVALID",
      error.status,
    );
  }
  if (error.code === "TRYON_REQUEST_TOO_LARGE") {
    return new TryonRouteError("PHOTO_TOO_LARGE", 413);
  }
  return new TryonRouteError("PHOTO_INVALID", error.status);
}

export function productFailure(error: unknown): TryonRouteError | null {
  if (!(error instanceof Error) || error.name !== "TryonProductError") {
    return null;
  }
  const code = Reflect.get(error, "code");
  if (code === "PRODUCT_NOT_FOUND") {
    return new TryonRouteError("PRODUCT_NOT_FOUND", 404);
  }
  if (code === "PRODUCT_REFERENCE_UNAVAILABLE") {
    return new TryonRouteError("REFERENCE_UNAVAILABLE", 422);
  }
  if (code === "PRODUCT_UNAVAILABLE") {
    return new TryonRouteError("PRODUCT_UNAVAILABLE", 409);
  }
  return new TryonRouteError("PRODUCT_NOT_ELIGIBLE", 422);
}

function providerFailure(error: DrapeProviderError): TryonRouteError {
  if (error.code === "deadline_exceeded") {
    return new TryonRouteError("PROVIDER_TIMEOUT", 504);
  }
  if (error.code === "invalid_request" || error.code === "safety_rejected") {
    return new TryonRouteError("PROVIDER_REJECTED", 422);
  }
  if (error.code === "invalid_response") {
    return new TryonRouteError("OUTPUT_INVALID", 502);
  }
  return new TryonRouteError("PROVIDER_UNAVAILABLE", 503);
}

export function reservationFailure(
  reservation: BudgetReservation,
): TryonRouteError {
  if (reservation.outcome === "duplicate") {
    if (
      reservation.requestStatus === "reserved" ||
      reservation.requestStatus === "in_progress"
    ) {
      return new TryonRouteError("TRYON_ALREADY_PROCESSING", 409);
    }
    if (reservation.requestStatus === "ambiguous_provider") {
      return new TryonRouteError("PROVIDER_TIMEOUT", 409);
    }
    return new TryonRouteError("TRYON_ALREADY_COMPLETED", 409);
  }
  if (reservation.outcome === "budget_exhausted") {
    return new TryonRouteError("TRYON_BUDGET_PAUSED", 503);
  }
  return new TryonRouteError("TRYON_CONFIGURATION_INVALID", 503);
}

export function responseForUnknown(error: unknown): TryonRouteError {
  if (error instanceof TryonRouteError) return error;
  if (error instanceof DrapeProviderError) return providerFailure(error);
  const product = productFailure(error);
  if (product) return product;
  if (error instanceof DrapeReferenceValidationError) {
    if (error.role === "product-primary" || error.role === "product-detail") {
      return new TryonRouteError("REFERENCE_UNAVAILABLE", 422);
    }
    return new TryonRouteError(
      error.validationCode === "image_too_large"
        ? "PHOTO_TOO_LARGE"
        : "PHOTO_INVALID",
      error.validationCode === "image_too_large" ? 413 : 400,
    );
  }
  if (error instanceof ImageValidationError) {
    return new TryonRouteError("OUTPUT_INVALID", 502);
  }
  return new TryonRouteError("UNKNOWN", 500);
}

export function settlementFor(error: unknown): {
  status: "ambiguous_provider" | "failed_post_provider";
  publicError: TryonRouteError;
} {
  const publicError = responseForUnknown(error);
  if (
    error instanceof DrapeProviderError &&
    (error.code === "deadline_exceeded" ||
      error.code === "authentication_failed" ||
      error.code === "cancelled" ||
      error.code === "model_not_found" ||
      error.code === "rate_limited" ||
      error.code === "upstream_unavailable")
  ) {
    return {
      publicError: new TryonRouteError("PROVIDER_TIMEOUT", 504),
      status: "ambiguous_provider",
    };
  }
  return { publicError, status: "failed_post_provider" };
}
