import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readClientConsent: vi.fn(),
}));

vi.mock("@/lib/analytics/consent", () => ({
  readClientConsent: mocks.readClientConsent,
}));

import { trackEvent } from "@/lib/analytics/track";

describe("trackEvent consent guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not queue an event while consent is unknown", () => {
    const push = vi.fn();

    mocks.readClientConsent.mockReturnValue("unknown");
    vi.stubGlobal("window", {
      dataLayer: { push },
    });

    trackEvent("view_item", {
      currency: "INR",
      value: 5000,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("does not queue an event when consent is denied", () => {
    const push = vi.fn();

    mocks.readClientConsent.mockReturnValue("denied");
    vi.stubGlobal("window", {
      dataLayer: { push },
    });

    trackEvent("view_item", {
      currency: "INR",
      value: 5000,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("queues the event after consent is granted", () => {
    const push = vi.fn();

    mocks.readClientConsent.mockReturnValue("granted");
    vi.stubGlobal("window", {
      dataLayer: { push },
    });

    trackEvent("view_item", {
      currency: "INR",
      event_id: "event-123",
      value: 5000,
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      event: "view_item",
      event_source: "client_gtm",
      currency: "INR",
      event_id: "event-123",
      value: 5000,
    });
  });

  it("initializes the dataLayer when it does not exist", () => {
    mocks.readClientConsent.mockReturnValue("granted");

    const browserWindow: {
      dataLayer?: Array<Record<string, unknown>>;
    } = {};

    vi.stubGlobal("window", browserWindow);

    trackEvent("select_item", {
      source: "product_card",
    });

    expect(browserWindow.dataLayer).toEqual([
      {
        event: "select_item",
        event_source: "client_gtm",
        source: "product_card",
      },
    ]);
  });

  it("never throws when the dataLayer push fails", () => {
    mocks.readClientConsent.mockReturnValue("granted");

    vi.stubGlobal("window", {
      dataLayer: {
        push: vi.fn(() => {
          throw new Error("dataLayer unavailable");
        }),
      },
    });

    expect(() => {
      trackEvent("add_to_cart", {
        currency: "INR",
        value: 5000,
      });
    }).not.toThrow();
  });
});
