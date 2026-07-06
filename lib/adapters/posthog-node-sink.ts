/**
 * PostHog server-side sink adapter.
 *
 * Env-gated: only active when POSTHOG_KEY is set. Sends server events
 * (order_created, payment_completed, etc.) to PostHog so product analytics
 * spans both client (browsing) and server (purchases) in one place.
 *
 * Uses a lazily-initialised posthog-node client (cheap; shares an HTTP pool).
 * distinct_id is taken from the event payload if present (we set it server-side
 * for orders that carry a userId), falling back to the event_id.
 */
import { PostHog } from "posthog-node";
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";
import { createLogger } from "@/lib/log";

const log = createLogger("analytics:posthog-sink");

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
    });
  }
  return client;
}

/**
 * Returns the PostHog sink when POSTHOG_KEY is present, or null otherwise.
 */
export function buildPosthogNodeSink(): AnalyticsSink | null {
  if (!process.env.POSTHOG_KEY) return null;

  return {
    async emit(event: AnalyticsEvent): Promise<void> {
      const ph = getClient();
      if (!ph) return;

      const payload = event.payload as Record<string, unknown>;
      // Prefer a known user id when present (orders carry userId/visitorId).
      const distinctId =
        (typeof payload.userId === "string" && payload.userId) ||
        (typeof payload.visitorId === "string" && payload.visitorId) ||
        event.event_id;

      try {
        ph.capture({
          distinctId,
          event: event.type,
          properties: { ...payload, event_id: event.event_id },
          timestamp: event.occurredAt,
        });
        // posthog-node batches internally; flush periodically in prod.
      } catch (err) {
        log.error("posthog-node capture failed", {
          err: err as Record<string, unknown>,
          type: event.type,
        });
      }
    },
  };
}

/** Graceful shutdown hook — flush the queue before the process exits. */
export async function shutdownPosthogSink(): Promise<void> {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
