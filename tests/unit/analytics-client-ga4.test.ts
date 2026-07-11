import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readClientConsent: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/analytics/consent", () => ({
  readClientConsent: mocks.readClientConsent,
}));

vi.mock("@/lib/analytics/track", () => ({
  trackEvent: mocks.trackEvent,
}));

import { trackWebsiteMetric } from "@/lib/analytics/client";
import type { Ga4EcommerceEvent } from "@/lib/analytics/ga4-ecommerce";

const EVENT_ID = "00000000-0000-4000-8000-000000000001";

const internalPayload = {
  pricePaise: 500000,
  productId: "product-123",
  slug: "heritage-silk-saree",
  source: "pdp",
};

const ga4Event: Ga4EcommerceEvent = {
  name: "view_item",
  params: {
    currency: "INR",
    items: [
      {
        item_category: "Saree",
        item_id: "product-123",
        item_name: "Heritage Silk Saree",
        item_variant: "Silk",
        price: 5000,
        quantity: 1,
      },
    ],
    source: "pdp",
    value: 5000,
  },
};

describe("trackWebsiteMetric GA4 bridge", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.readClientConsent.mockReturnValue("granted");

    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => EVENT_ID),
    });

    sendBeaconMock = vi.fn(() => false);
    vi.stubGlobal("navigator", {
      sendBeacon: sendBeaconMock,
    });

    fetchMock = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nothing when analytics consent has not been granted", () => {
    mocks.readClientConsent.mockReturnValue("unknown");

    trackWebsiteMetric("product_view", internalPayload, ga4Event);

    expect(sendBeaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("uses the same event ID for the internal and GA4 representations", () => {
    trackWebsiteMetric("product_view", internalPayload, ga4Event);

    expect(mocks.trackEvent).toHaveBeenCalledWith("view_item", {
      ...ga4Event.params,
      event_id: EVENT_ID,
    });

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe("/api/v2/events/track");

    expect(JSON.parse(String(request.body))).toEqual({
      eventId: EVENT_ID,
      payload: internalPayload,
      type: "product_view",
    });
  });

  it("preserves internal-only metrics when no GA4 event is supplied", () => {
    trackWebsiteMetric("collection_view", {
      collectionSlug: "all",
      source: "collection",
    });

    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(JSON.parse(String(request.body))).toEqual({
      eventId: EVENT_ID,
      payload: {
        collectionSlug: "all",
        source: "collection",
      },
      type: "collection_view",
    });
  });

  it("does not call fetch when sendBeacon successfully queues the event", () => {
    sendBeaconMock.mockReturnValue(true);

    trackWebsiteMetric("product_view", internalPayload, ga4Event);

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the fallback request rejects", async () => {
    fetchMock.mockRejectedValue(new Error("Network unavailable"));

    expect(() => {
      trackWebsiteMetric("product_view", internalPayload, ga4Event);
    }).not.toThrow();

    await Promise.resolve();
  });
});
