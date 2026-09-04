import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { createLogger } from "@/lib/log";

type TryonObservationContext = {
  now: () => number;
  startedAt: number;
  traceId: string;
};

type TryonObservationLevel = "debug" | "warn";

const observationContext = new AsyncLocalStorage<TryonObservationContext>();
const log = createLogger("drape-room:generate");

function shouldEmitObservations(): boolean {
  return (
    process.env.NODE_ENV !== "test" ||
    process.env.FTT_TRYON_TEST_OBSERVABILITY === "true"
  );
}

function elapsedMs(context: TryonObservationContext): number {
  const elapsed = context.now() - context.startedAt;
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0;
}

/**
 * Reads one bounded scalar off an error. Anything that is not a short string or
 * a finite number is dropped, so an adapter that ever attaches a provider
 * request/response object cannot widen the log line.
 */
function errorField(error: unknown, field: string): string | number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value: unknown = Reflect.get(error, field);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 64) return value;
  return undefined;
}

/**
 * Creates one request-local correlation scope. Only bounded metadata may be
 * passed to the observation helpers: never photos, prompts, headers, cookies,
 * provider bodies, URLs, session/IP tags, or secrets.
 *
 * Stage observations are deliberately `debug`: a healthy request prints one
 * terminal line (see `observeTryonSucceeded` / `observeTryonFailed`). Run with
 * `LOG_LEVEL=debug` to replay the full per-stage trace.
 */
export function withTryonObservability<T>(
  run: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const context = {
    now,
    startedAt: now(),
    traceId: randomUUID(),
  } satisfies TryonObservationContext;

  return observationContext.run(context, async () => {
    observeTryonStage("request_received");
    return run();
  });
}

export function currentTryonTraceId(): string | null {
  return observationContext.getStore()?.traceId ?? null;
}

export function observeTryonStage(
  stage: string,
  meta?: Record<string, unknown>,
  level: TryonObservationLevel = "debug",
): void {
  if (!shouldEmitObservations()) return;
  const context = observationContext.getStore();
  const fields = {
    elapsedMs: context ? elapsedMs(context) : null,
    stage,
    traceId: context?.traceId ?? "unscoped",
    ...meta,
  };
  log[level]("Try-on stage reached", fields);
}

/** One line per completed generation: the success half of the request outcome. */
export function observeTryonSucceeded(meta?: Record<string, unknown>): void {
  if (!shouldEmitObservations()) return;
  const context = observationContext.getStore();
  log.info("Try-on image generated", {
    durationMs: context ? elapsedMs(context) : null,
    traceId: context?.traceId ?? "unscoped",
    ...meta,
  });
}

/** One line per rejected or failed generation: the failure half of the outcome. */
export function observeTryonFailed(
  code: string,
  status: number,
  meta?: Record<string, unknown>,
): void {
  if (!shouldEmitObservations()) return;
  const context = observationContext.getStore();
  log.warn("Try-on image generation failed", {
    code,
    durationMs: context ? elapsedMs(context) : null,
    status,
    traceId: context?.traceId ?? "unscoped",
    ...meta,
  });
}

export function observeTryonRejection(
  stage: string,
  code: string,
  status: number,
  meta?: Record<string, unknown>,
): void {
  if (!shouldEmitObservations()) return;
  const context = observationContext.getStore();
  log.warn("Try-on request rejected", {
    code,
    elapsedMs: context ? elapsedMs(context) : null,
    stage,
    status,
    traceId: context?.traceId ?? "unscoped",
    ...meta,
  });
}

export function observeTryonFailure(
  stage: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  if (!shouldEmitObservations()) return;
  const context = observationContext.getStore();
  log.error("Try-on stage failed", {
    elapsedMs: context ? elapsedMs(context) : null,
    errorCode: errorField(error, "code"),
    errorName:
      error instanceof Error ? error.name : typeof error,
    errorStatus: errorField(error, "status"),
    // Only an Error is narrowed to message/name/stack by the logger. A thrown
    // provider payload object would be walked key by key, so it never gets
    // passed through: its bounded code/name/status fields above are enough.
    err: error instanceof Error ? error : undefined,
    stage,
    traceId: context?.traceId ?? "unscoped",
    ...meta,
  });
}

/** Exposes the correlation id without changing the sanitized JSON body. */
export function withTryonTraceHeader(headers?: HeadersInit): Headers {
  const output = new Headers(headers);
  const traceId = currentTryonTraceId();
  if (traceId) output.set("X-FTT-Tryon-Trace-Id", traceId);
  return output;
}
