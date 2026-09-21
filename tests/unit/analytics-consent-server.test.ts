import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The internal (first-party) sink imports the Drizzle client at module load,
// which needs DATABASE_URL. Stub the query layer so this suite can exercise the
// fan-out without a database, exactly as analytics-emit.test.ts does.
const insertEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/db/queries/events", () => ({
  insertEvent: insertEventMock,
}));

import {
  _overrideSinks,
  _resetSinks,
  emitAnalyticsEvent,
} from "@/lib/analytics/emit";
import {
  consentFromCookieHeader,
  consentFromRecord,
  consentFromRequest,
} from "@/lib/analytics/server-consent";
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";

/**
 * Server-side consent enforcement.
 *
 * Being env-configured is not permission. A third-party sink receives an event
 * only when that event carries consent for its category, and an event with no
 * consent at all — a cron run, a Razorpay webhook — reaches first-party sinks
 * only.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const baseEvent = (
  consent?: AnalyticsEvent["consent"],
): AnalyticsEvent => ({
  consent,
  event_id: "11111111-1111-4111-8111-111111111111",
  occurredAt: new Date("2026-09-21T00:00:00.000Z"),
  payload: { orderId: "order-1" },
  type: "payment_completed",
});

function spySinks() {
  const firstParty = { emit: vi.fn().mockResolvedValue(undefined) };
  const ga4: AnalyticsSink = {
    emit: vi.fn().mockResolvedValue(undefined),
    name: "ga4",
    requiresConsent: "analytics",
  };
  const meta: AnalyticsSink = {
    emit: vi.fn().mockResolvedValue(undefined),
    name: "meta-capi",
    requiresConsent: "advertising",
  };
  _overrideSinks([firstParty, ga4, meta]);
  return { firstParty, ga4, meta };
}

beforeEach(() => {
  _resetSinks();
});

afterEach(() => {
  _resetSinks();
  vi.unstubAllEnvs();
});

describe("reading consent from a request", () => {
  it("treats a missing Cookie header as refusal", () => {
    expect(consentFromCookieHeader(null)).toEqual({
      advertising: false,
      analytics: false,
    });
  });

  it("treats absent cookies as refusal", () => {
    expect(consentFromCookieHeader("session=abc; other=1")).toEqual({
      advertising: false,
      analytics: false,
    });
  });

  it("reads each category independently", () => {
    expect(
      consentFromCookieHeader(
        "ftt_analytics_consent=granted; ftt_advertising_consent=denied",
      ),
    ).toEqual({ advertising: false, analytics: true });

    expect(
      consentFromCookieHeader(
        "ftt_analytics_consent=denied; ftt_advertising_consent=granted",
      ),
    ).toEqual({ advertising: true, analytics: false });
  });

  it("accepts only the exact word granted", () => {
    for (const value of ["true", "1", "GRANTED", "yes", "", "unknown"]) {
      expect(
        consentFromCookieHeader(`ftt_advertising_consent=${value}`).advertising,
      ).toBe(false);
    }
  });

  it("does not confuse one cookie name for another", () => {
    // A cookie whose name merely ends with the real one must not be read.
    expect(
      consentFromCookieHeader("x_ftt_advertising_consent=granted").advertising,
    ).toBe(false);
  });

  it("survives a malformed percent-escape without granting", () => {
    expect(
      consentFromCookieHeader("ftt_advertising_consent=%E0%A4%A").advertising,
    ).toBe(false);
  });

  it("reads a real Request", () => {
    const request = new Request("https://www.fromthetrunk.shop/", {
      headers: { cookie: "ftt_advertising_consent=granted" },
    });
    expect(consentFromRequest(request)).toEqual({
      advertising: true,
      analytics: false,
    });
  });
});

describe("reading consent recorded on an order", () => {
  it("treats NULL columns as refusal", () => {
    expect(
      consentFromRecord({ advertisingConsent: null, analyticsConsent: null }),
    ).toEqual({ advertising: false, analytics: false });
  });

  it("treats a missing column as refusal", () => {
    expect(consentFromRecord({})).toEqual({
      advertising: false,
      analytics: false,
    });
  });

  it("returns what the shopper actually chose", () => {
    expect(
      consentFromRecord({ advertisingConsent: true, analyticsConsent: false }),
    ).toEqual({ advertising: true, analytics: false });
  });
});

describe("the fan-out honours consent", () => {
  it("sends to first-party sinks even with no consent at all", async () => {
    const { firstParty, ga4, meta } = spySinks();

    await emitAnalyticsEvent(baseEvent());

    expect(firstParty.emit).toHaveBeenCalledTimes(1);
    expect(ga4.emit).not.toHaveBeenCalled();
    expect(meta.emit).not.toHaveBeenCalled();
  });

  it("refuses Meta when advertising was declined", async () => {
    const { meta, ga4 } = spySinks();

    await emitAnalyticsEvent(
      baseEvent({ advertising: false, analytics: true }),
    );

    expect(meta.emit).not.toHaveBeenCalled();
    expect(ga4.emit).toHaveBeenCalledTimes(1);
  });

  it("refuses Google when analytics was declined", async () => {
    const { meta, ga4 } = spySinks();

    await emitAnalyticsEvent(
      baseEvent({ advertising: true, analytics: false }),
    );

    expect(ga4.emit).not.toHaveBeenCalled();
    expect(meta.emit).toHaveBeenCalledTimes(1);
  });

  it("sends to both when both were granted", async () => {
    const { firstParty, ga4, meta } = spySinks();

    await emitAnalyticsEvent(baseEvent({ advertising: true, analytics: true }));

    expect(firstParty.emit).toHaveBeenCalledTimes(1);
    expect(ga4.emit).toHaveBeenCalledTimes(1);
    expect(meta.emit).toHaveBeenCalledTimes(1);
  });

  it("still never throws when a permitted sink fails", async () => {
    const failing: AnalyticsSink = {
      emit: vi.fn().mockRejectedValue(new Error("boom")),
      requiresConsent: "advertising",
    };
    _overrideSinks([failing]);

    await expect(
      emitAnalyticsEvent(baseEvent({ advertising: true, analytics: true })),
    ).resolves.toBeUndefined();
  });
});

describe("every third-party sink declares a consent category", () => {
  it("Meta requires advertising", () => {
    const sink = read("lib/adapters/meta-capi-sink.ts");
    expect(sink).toContain('requiresConsent: "advertising"');
  });

  it("GA4 requires analytics", () => {
    const sink = read("lib/adapters/ga4-sink.ts");
    expect(sink).toContain('requiresConsent: "analytics"');
  });

  it("the first-party event store requires none", () => {
    // Our own database records the order we are performing; it is not
    // optional tracking and must keep working when a visitor refuses.
    const sink = read("lib/adapters/internal-events-sink.ts");
    expect(sink).not.toContain("requiresConsent");
  });
});

describe("what Meta actually receives", () => {
  const sink = read("lib/adapters/meta-capi-sink.ts");

  it("never spreads the internal payload into the request", () => {
    // This is how userId, referrer, discountCode and the order/payment
    // references used to reach Meta.
    expect(sink).not.toContain("...event.payload");
  });

  it("sends custom_data only when the allowlist produces something", () => {
    expect(sink).toContain("const customData = buildMetaCustomData(event);");
    expect(sink).toContain("...(customData ? { custom_data: customData } : {})");
  });

  it("has an empty allowlist by default", () => {
    const fn = sink.slice(
      sink.indexOf("function buildMetaCustomData"),
      sink.indexOf("Returns the Meta CAPI sink"),
    );
    expect(fn).toContain("return undefined;");
    // Re-enabling revenue or catalogue data must be a deliberate edit.
    expect(fn).not.toContain("totalPaise as number");
  });

  it("still sends the deduplication id, so the browser Pixel is not double-counted", () => {
    expect(sink).toContain("event_id: event.event_id");
  });
});

describe("the server paths that emit", () => {
  it("records the shopper's decision on the order at creation", () => {
    const route = read("api/hono/routes/payments.ts");
    expect(route).toContain("const trackingConsent = consentFromRequest(c.req.raw);");
    expect(route).toContain("advertisingConsent: trackingConsent.advertising,");
    expect(route).toContain("analyticsConsent: trackingConsent.analytics,");
    expect(route).toContain("consent: trackingConsent,");
  });

  it("reads that decision back when payment completes", () => {
    // This is the webhook/reconciler path, where there is no cookie.
    const complete = read("lib/orders/complete-paid-order.ts");
    expect(complete).toContain("consent: consentFromRecord(existing),");
  });

  it("re-checks the cookie on the browser track route", () => {
    const route = read("api/hono/routes/events.ts");
    expect(route).toContain("consent: consentFromRequest(c.req.raw),");
  });

  it("leaves cron runs with no consent, so they stay first-party", () => {
    const cron = read("api/hono/routes/cron.ts");
    expect(cron).not.toContain("consentFromRequest");
  });

  it("leaves the admin publish event first-party too", () => {
    // content_published is an editor action, not visitor tracking.
    const pages = read("api/hono/routes/pages.ts");
    expect(pages).not.toContain("consentFromRequest");
  });
});

describe("the orders table stores the decision", () => {
  it("has both nullable columns", () => {
    const schema = read("db/schema.ts");
    expect(schema).toContain('analyticsConsent: boolean("analytics_consent")');
    expect(schema).toContain(
      'advertisingConsent: boolean("advertising_consent")',
    );
  });

  it("ships an additive migration", () => {
    const sql = read("drizzle/0033_orders_tracking_consent.sql");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "analytics_consent" boolean');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "advertising_consent" boolean',
    );
    // No backfill: an existing order must not be retro-granted consent.
    expect(sql).not.toMatch(/UPDATE\s+"?orders"?/i);
    expect(sql).not.toMatch(/DEFAULT\s+true/i);
  });
});
