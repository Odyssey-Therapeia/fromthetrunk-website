import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { createLogger } from "@/lib/log";

type TryonObservationContext = {
  now: () => number;
  startedAt: number;
  traceId: string;
};

type TryonObservationLevel = "debug" | "info" | "warn";

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

function errorField(error: unknown, field: string): unknown {
  return typeof error === "object" && error !== null
    ? Reflect.get(error, field)
    : undefined;
}

/**
 * Creates one request-local correlation scope. Only bounded metadata may be
 * passed to the observation helpers: never photos, prompts, headers, cookies,
 * provider bodies, URLs, session/IP tags, or secrets.
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
    observeTryonStage("request_received", undefined, "info");
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
    err: error,
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
