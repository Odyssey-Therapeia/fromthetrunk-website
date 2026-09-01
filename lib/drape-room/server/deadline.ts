import { DrapeProviderError } from "@/lib/drape-room/server/provider";

export const TRYON_PLATFORM_MAX_DURATION_MS = 240_000;
export const TRYON_PLATFORM_EXIT_MARGIN_MS = 5_000;
export const TRYON_SETTLEMENT_MARGIN_MS = 20_000;
export const TRYON_SETTLEMENT_DEADLINE_MS =
  TRYON_PLATFORM_MAX_DURATION_MS - TRYON_PLATFORM_EXIT_MARGIN_MS;
export const TRYON_WORK_DEADLINE_MS =
  TRYON_SETTLEMENT_DEADLINE_MS - TRYON_SETTLEMENT_MARGIN_MS;

export type TryonInvocationDeadline = {
  readonly signal: AbortSignal;
  assertWorkAvailable(): void;
  redisLeaseMs(): number;
  runBeforeWorkDeadline<T>(operation: () => Promise<T>): Promise<T>;
  runBeforeSettlementDeadline<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
};

type DeadlineOptions = {
  now?: () => number;
  upstreamSignal?: AbortSignal;
};

/**
 * Stops paid work early enough to leave a bounded metadata-settlement window
 * before Vercel's hard function ceiling. It never retries provider work.
 */
export function createTryonInvocationDeadline(
  options: DeadlineOptions = {},
): TryonInvocationDeadline {
  const now = options.now ?? Date.now;
  const startedAt = now();
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) {
    throw new DrapeProviderError("deadline_exceeded", 504);
  }
  const workDeadlineAt = startedAt + TRYON_WORK_DEADLINE_MS;
  const settlementDeadlineAt = startedAt + TRYON_SETTLEMENT_DEADLINE_MS;
  const controller = new AbortController();
  const abortForDeadline = () => {
    controller.abort(new DrapeProviderError("deadline_exceeded", 504));
  };
  const abortForUpstream = () => {
    controller.abort(new DrapeProviderError("cancelled", 499));
  };
  const timer = setTimeout(abortForDeadline, TRYON_WORK_DEADLINE_MS);
  timer.unref?.();
  const upstream = options.upstreamSignal;
  if (upstream?.aborted) abortForUpstream();
  else upstream?.addEventListener("abort", abortForUpstream, { once: true });

  const abortReason = (): DrapeProviderError => {
    const reason = controller.signal.reason;
    return reason instanceof DrapeProviderError
      ? reason
      : new DrapeProviderError("deadline_exceeded", 504);
  };

  const assertWorkAvailable = () => {
    if (controller.signal.aborted || now() >= workDeadlineAt) {
      if (!controller.signal.aborted) abortForDeadline();
      throw abortReason();
    }
  };

  return {
    signal: controller.signal,
    assertWorkAvailable,
    redisLeaseMs() {
      assertWorkAvailable();
      const remaining = settlementDeadlineAt - now();
      if (!Number.isSafeInteger(remaining) || remaining < 1_000) {
        abortForDeadline();
        throw abortReason();
      }
      return Math.min(TRYON_SETTLEMENT_DEADLINE_MS, remaining);
    },
    async runBeforeWorkDeadline<T>(operation: () => Promise<T>) {
      assertWorkAvailable();
      let interrupt: (() => void) | null = null;
      const interrupted = new Promise<never>((_resolve, reject) => {
        interrupt = () => reject(abortReason());
        controller.signal.addEventListener("abort", interrupt, { once: true });
        if (controller.signal.aborted) interrupt();
      });
      try {
        return await Promise.race([operation(), interrupted]);
      } finally {
        if (interrupt) {
          controller.signal.removeEventListener("abort", interrupt);
        }
      }
    },
    async runBeforeSettlementDeadline<T>(operation: () => Promise<T>) {
      const remaining = settlementDeadlineAt - now();
      if (!Number.isSafeInteger(remaining) || remaining <= 0) {
        throw new DrapeProviderError("deadline_exceeded", 504);
      }
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          operation(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new DrapeProviderError("deadline_exceeded", 504)),
              remaining,
            );
            timeout.unref?.();
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    dispose() {
      clearTimeout(timer);
      upstream?.removeEventListener("abort", abortForUpstream);
    },
  };
}
