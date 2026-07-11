import { describe, expect, it, vi } from "vitest";

import { registerEventsRoutes } from "@/api/hono/routes/events";
import { createRouteHarness } from "@/tests/helpers/route-harness";

const emitAnalyticsEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/analytics/emit", () => ({
  emitAnalyticsEvent: emitAnalyticsEventMock,
}));

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("POST /events/track", () => {
  it("accepts storefront events, strips blocked payload keys, and enriches context", async () => {
    emitAnalyticsEventMock.mockClear();

    const harness = createRouteHarness({
      authUser: {
        email: "customer@example.com",
        id: "user-123",
        role: "customer",
      },
      register: registerEventsRoutes,
    });

    const response = await harness.request("/track", {
      body: JSON.stringify({
        eventId: "4d6282f0-7a49-45a9-821b-bf6dd0fd971e",
        payload: {
          email: "customer@example.com",
          filterType: "fabric",
          filterValue: "silk",
          Name: "Customer Name",
          phone: "+91 99999 99999",
          postalCode: "560001",
          productId: "11111111-1111-4111-8111-111111111111",
        },
        type: "filter_applied",
      }),
      headers: {
        "Content-Type": "application/json",
        referer: "https://fromthetrunk.com/collection?fabric=silk",
        "x-real-ip": "203.0.113.41",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(emitAnalyticsEventMock).toHaveBeenCalledOnce();
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "4d6282f0-7a49-45a9-821b-bf6dd0fd971e",
        type: "filter_applied",
      }),
    );

    const emitted = emitAnalyticsEventMock.mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };

    expect(emitted.payload).toEqual(
      expect.objectContaining({
        filterType: "fabric",
        filterValue: "silk",
        productId: "11111111-1111-4111-8111-111111111111",
        referrer: "https://fromthetrunk.com/collection?fabric=silk",
        userId: "user-123",
      }),
    );
    expect(emitted.payload).not.toHaveProperty("email");
    expect(emitted.payload).not.toHaveProperty("Name");
    expect(emitted.payload).not.toHaveProperty("phone");
    expect(emitted.payload).not.toHaveProperty("postalCode");
  });

  it("drops a malformed (non-UUID) productId so it cannot poison uuid queries", async () => {
    emitAnalyticsEventMock.mockClear();

    const harness = createRouteHarness({
      authUser: null,
      register: registerEventsRoutes,
    });

    const response = await harness.request("/track", {
      body: JSON.stringify({
        payload: { productId: "abc" },
        type: "product_view",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const emitted = emitAnalyticsEventMock.mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(emitted.payload).not.toHaveProperty("productId");
  });

  it.each([
    "collection_view",
    "product_card_click",
    "product_view",
    "add_to_cart",
    "cart_viewed",
    "checkout_started",
    "search_performed",
    "filter_applied",
  ] as const)("accepts storefront event type %s", async (type) => {
    emitAnalyticsEventMock.mockClear();

    const harness = createRouteHarness({
      register: registerEventsRoutes,
    });

    const response = await harness.request("/track", {
      body: JSON.stringify({
        payload: { source: "unit_allowlist" },
        type,
      }),
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.44",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type }),
    );
  });

  it("generates an event id when the client does not provide one", async () => {
    emitAnalyticsEventMock.mockClear();

    const harness = createRouteHarness({
      register: registerEventsRoutes,
    });

    const response = await harness.request("/track", {
      body: JSON.stringify({
        payload: { source: "collection_page" },
        type: "collection_view",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.42",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const emitted = emitAnalyticsEventMock.mock.calls[0]?.[0] as {
      event_id: string;
    };
    expect(emitted.event_id).toMatch(uuidPattern);
  });

  it("rejects non-website analytics event types", async () => {
    emitAnalyticsEventMock.mockClear();

    const harness = createRouteHarness({
      register: registerEventsRoutes,
    });

    const response = await harness.request("/track", {
      body: JSON.stringify({
        payload: { orderId: "order-1" },
        type: "order_created",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.43",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(emitAnalyticsEventMock).not.toHaveBeenCalled();
  });
});
