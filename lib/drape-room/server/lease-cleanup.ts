import type { TryonGenerationLease } from "@/lib/drape-room/security/redis-guard";
import type { TryonInvocationDeadline } from "@/lib/drape-room/server/deadline";
import {
  observeTryonFailure,
  observeTryonStage,
} from "@/lib/drape-room/server/observability";

/** Releases both distributed lease parts and never reports an unknown result as success. */
export async function releaseTryonLeaseObserved(
  deadline: TryonInvocationDeadline,
  lease: TryonGenerationLease,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    const result = await deadline.runBeforeSettlementDeadline(() =>
      lease.release(),
    );
    if (!result.complete) {
      observeTryonFailure(
        "redis_lease_release_failed",
        new Error("redis_lease_release_unconfirmed"),
        { ...meta, globalRelease: result.global, sessionRelease: result.session },
      );
      return;
    }
    const stage =
      result.session === "not_owned"
        ? "redis_lease_not_owned"
        : result.global === "already_absent" ||
            result.session === "already_absent"
          ? "redis_lease_already_expired"
          : "redis_lease_released";
    // A clean release is routine tracing; losing or outliving the lease is an
    // anomaly that stays visible at the default log level.
    observeTryonStage(
      stage,
      {
        ...meta,
        globalRelease: result.global,
        sessionRelease: result.session,
      },
      stage === "redis_lease_released" ? "debug" : "warn",
    );
  } catch (error) {
    observeTryonFailure("redis_lease_release_failed", error, meta);
  }
}
