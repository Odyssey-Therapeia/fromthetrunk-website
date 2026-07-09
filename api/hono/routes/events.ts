import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import type { AnalyticsEventType } from "@/lib/ports/analytics-sink";

const websiteEventTypeSchema = z.enum([
  "collection_view",
  "product_card_click",
  "product_view",
  "add_to_cart",
  "cart_viewed",
  "checkout_started",
  "search_performed",
  "filter_applied",
]);

const trackEventSchema = z.object({
  eventId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  type: websiteEventTypeSchema,
});

const blockedPayloadKeys = new Set([
  "email",
  "phone",
  "mobile",
  "name",
  "address",
  "line1",
  "line2",
  "pincode",
  "postal",
  "postalcode",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanPayload(payload: Record<string, unknown>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !blockedPayloadKeys.has(key.toLowerCase()),
    ),
  );
  // Drop a malformed productId (this endpoint is public and unauthenticated, so
  // bots/scanners can post arbitrary values). A stored non-UUID productId would
  // otherwise poison uuid-based analytics queries such as the top-viewed
  // ranking join. Only canonical UUIDs are kept.
  if (
    typeof cleaned.productId === "string" &&
    !UUID_RE.test(cleaned.productId)
  ) {
    delete cleaned.productId;
  }
  return cleaned;
}

export const registerEventsRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/track",
      request: {
        body: {
          content: {
            "application/json": {
              schema: trackEventSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Event accepted",
        },
        429: {
          description: "Too many tracking events",
        },
      },
      tags: ["Events"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "events:track", {
        limit: 120,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const authUser = c.get("authUser");
      const body = c.req.valid("json");

      await emitAnalyticsEvent({
        event_id: body.eventId ?? crypto.randomUUID(),
        occurredAt: new Date(),
        payload: {
          ...cleanPayload(body.payload),
          referrer: c.req.header("referer") ?? null,
          userId: authUser?.id ?? null,
        },
        type: body.type as AnalyticsEventType,
      });

      return c.json({ success: true }, 200);
    },
  );
};
