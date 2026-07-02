import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB + event helpers the idempotency module depends on.
const mocks = vi.hoisted(() => ({
  orderRows: [] as Array<Record<string, unknown>>,
  getEventByEventId: vi.fn(),
  claimEvent: vi.fn(async () => true),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => {
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = () => builder;
      builder.limit = () => builder;
      (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        resolve(mocks.orderRows);
      return builder;
    },
  },
}));

vi.mock("@/db/queries/events", () => ({
  getEventByEventId: mocks.getEventByEventId,
  claimEvent: mocks.claimEvent,
}));

vi.mock("@/lib/orders/order-access-token", () => ({
  createOrderAccessToken: (orderId: string) => `token:${orderId}`,
}));

import {
  findReusablePaymentOrder,
  recordPaymentAttempt,
} from "@/lib/payments/checkout-idempotency";

const EXPIRY_MS = 10_000;

const storedEvent = (over: Record<string, unknown> = {}) => ({
  eventId: "checkout_attempt:att-1",
  type: "checkout_attempt_created",
  occurredAt: new Date(0),
  payload: {
    orderId: "ord-1",
    paymentLinkId: "plink_123",
    paymentLinkUrl: "https://rzp.io/i/abc",
    amountPaise: 500000,
    currency: "INR",
    expiresAt: new Date(EXPIRY_MS).toISOString(),
    cartFingerprint: "fp-A",
    userId: "user-1",
    ...over,
  },
});

const pendingOrder = (over: Record<string, unknown> = {}) => ({
  id: "ord-1",
  userId: "user-1",
  totalPaise: 500000,
  paymentStatus: "pending",
  razorpayOrderId: "plink_123",
  ...over,
});

beforeEach(() => {
  mocks.orderRows = [];
  mocks.getEventByEventId.mockReset();
  mocks.claimEvent.mockReset();
  mocks.claimEvent.mockResolvedValue(true);
});

describe("findReusablePaymentOrder", () => {
  const call = (over: Record<string, unknown> = {}) =>
    findReusablePaymentOrder({
      attemptId: "att-1",
      cartFingerprint: "fp-A",
      userId: "user-1",
      nowMs: EXPIRY_MS - 1000, // not yet expired
      ...over,
    });

  it("reuses a still-valid pending order + link (retry does not duplicate)", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [pendingOrder()];

    const result = await call();
    expect(result).not.toBeNull();
    expect(result?.orderId).toBe("ord-1");
    expect(result?.paymentLinkUrl).toBe("https://rzp.io/i/abc");
    expect(result?.razorpayOrderId).toBe("plink_123");
    expect(result?.reused).toBe(true);
  });

  it("returns null when there is no recorded attempt", async () => {
    mocks.getEventByEventId.mockResolvedValue(null);
    expect(await call()).toBeNull();
  });

  it("does NOT reuse a paid order", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [pendingOrder({ paymentStatus: "paid" })];
    expect(await call()).toBeNull();
  });

  it("does NOT reuse a failed order", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [pendingOrder({ paymentStatus: "failed" })];
    expect(await call()).toBeNull();
  });

  it("does NOT reuse once the hold/link has expired", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [pendingOrder()];
    expect(await call({ nowMs: EXPIRY_MS + 1000 })).toBeNull();
  });

  it("does NOT reuse across a different cart fingerprint", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [pendingOrder()];
    expect(await call({ cartFingerprint: "fp-DIFFERENT" })).toBeNull();
  });

  it("does NOT reuse another user's order", async () => {
    mocks.getEventByEventId.mockResolvedValue(
      storedEvent({ userId: "user-2" }),
    );
    mocks.orderRows = [pendingOrder({ userId: "user-2" })];
    expect(await call({ userId: "user-1" })).toBeNull();
  });

  it("returns null when the order no longer exists", async () => {
    mocks.getEventByEventId.mockResolvedValue(storedEvent());
    mocks.orderRows = [];
    expect(await call()).toBeNull();
  });
});

describe("recordPaymentAttempt", () => {
  it("claims a namespaced event with ids only — no PII", async () => {
    await recordPaymentAttempt({
      attemptId: "att-2",
      cartFingerprint: "fp-A",
      userId: "user-1",
      orderId: "ord-9",
      paymentLinkId: "plink_9",
      paymentLinkUrl: "https://rzp.io/i/xyz",
      amountPaise: 123400,
      currency: "INR",
      expiresAt: new Date(EXPIRY_MS),
    });

    expect(mocks.claimEvent).toHaveBeenCalledTimes(1);
    // The mock is declared with no typed params, so `.mock.calls` is an empty
    // tuple type — cast to the known call shape (a 1-tuple of the arg) so the
    // indexed access is type-safe without `noUncheckedIndexedAccess` friction.
    type ClaimEventArg = {
      eventId: string;
      type: string;
      payload: Record<string, unknown>;
    };
    const arg = (
      mocks.claimEvent.mock.calls as unknown as [[ClaimEventArg]]
    )[0][0];
    expect(arg.eventId).toBe("checkout_attempt:att-2");
    expect(arg.type).toBe("checkout_attempt_created");
    expect(arg.payload.orderId).toBe("ord-9");
    expect(arg.payload.paymentLinkUrl).toBe("https://rzp.io/i/xyz");
    // No customer PII is persisted in the attempt record.
    const serialized = JSON.stringify(arg.payload);
    expect(serialized).not.toMatch(/@/); // no email
    expect(Object.keys(arg.payload)).not.toContain("email");
    expect(Object.keys(arg.payload)).not.toContain("name");
    expect(Object.keys(arg.payload)).not.toContain("phone");
  });
});
