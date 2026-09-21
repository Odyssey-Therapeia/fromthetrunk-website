/**
 * P2-07: Fan-out emit helper.
 *
 * Sends an AnalyticsEvent to ALL configured sinks.
 *
 * FIRE-AND-FORGET: a failing or throwing adapter MUST NOT propagate into the
 * money path (order creation, payment completion, cron). Each adapter call is
 * individually wrapped in a catch so one failure cannot cascade.
 *
 * Adapter selection:
 *   - internal-events: ALWAYS ON (default, no env gate)
 *   - ga4: env-gated (GA4_MEASUREMENT_ID + GA4_API_SECRET)
 *   - meta-capi: env-gated (META_CAPI_PIXEL_ID + META_CAPI_ACCESS_TOKEN)
 *
 * CONSENT: being configured is not permission to send. A sink that declares
 * `requiresConsent` receives an event only when the event carries that consent,
 * so a visitor who refused advertising never reaches Meta even though the env
 * vars are set. An event with no `consent` reaches first-party sinks only —
 * which is what cron runs and provider webhooks deliberately get.
 */
import { buildGa4Sink } from "@/lib/adapters/ga4-sink";
import { internalEventsSink } from "@/lib/adapters/internal-events-sink";
import { buildMetaCapiSink } from "@/lib/adapters/meta-capi-sink";
import {
  NO_TRACKING_CONSENT,
  type AnalyticsEvent,
  type AnalyticsSink,
} from "@/lib/ports/analytics-sink";
import { createLogger } from "@/lib/log";

const log = createLogger("analytics:emit");

/** Build the list of active sinks once per process (env vars do not change at runtime). */
function buildActiveSinks(): AnalyticsSink[] {
  const sinks: AnalyticsSink[] = [internalEventsSink];

  const ga4 = buildGa4Sink();
  if (ga4) sinks.push(ga4);

  const metaCapi = buildMetaCapiSink();
  if (metaCapi) sinks.push(metaCapi);

  return sinks;
}

// Lazily initialised so tests can stub process.env before the first call.
let _sinks: AnalyticsSink[] | null = null;

/** Exposed for testing — resets the cached sink list so env-gate changes take effect. */
export function _resetSinks(): void {
  _sinks = null;
}

/**
 * Exposed for testing — directly override the active sink list.
 * Use this to inject a throwing/spy sink without relying on vi.doMock after import.
 * Call _resetSinks() to restore env-gated defaults after the test.
 *
 * @example
 *   _overrideSinks([{ emit: vi.fn().mockRejectedValue(new Error("boom")) }]);
 *   await emitAnalyticsEvent(...);  // must not throw
 *   _resetSinks();
 */
export function _overrideSinks(sinks: AnalyticsSink[]): void {
  _sinks = sinks;
}

function getActiveSinks(): AnalyticsSink[] {
  if (!_sinks) _sinks = buildActiveSinks();
  return _sinks;
}

/**
 * Whether this sink may receive this event.
 *
 * A sink with no `requiresConsent` is first-party and always permitted. A sink
 * that names a category needs an explicit `true` for it: a missing `consent`
 * object is treated as refusal, never as "not established, so go ahead".
 */
function isPermitted(sink: AnalyticsSink, event: AnalyticsEvent): boolean {
  if (!sink.requiresConsent) return true;
  const consent = event.consent ?? NO_TRACKING_CONSENT;
  return consent[sink.requiresConsent] === true;
}

/**
 * Emit an analytics event to every configured sink the visitor's consent
 * permits.
 *
 * Fire-and-forget: errors from individual sinks are caught and logged.
 * This function itself never throws.
 */
export async function emitAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const sinks = getActiveSinks().filter((sink) => isPermitted(sink, event));

  await Promise.all(
    sinks.map((sink) =>
      sink.emit(event).catch((err: unknown) => {
        log.error("Sink failed", {
          err: err as Record<string, unknown>,
          type: event.type,
          event_id: event.event_id,
        });
      })
    )
  );
}
