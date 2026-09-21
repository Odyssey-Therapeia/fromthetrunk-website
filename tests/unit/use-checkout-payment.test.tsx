// @vitest-environment jsdom
/**
 * Checkout attempt handling in useCheckoutPayment, driven through a rendered
 * hook with a stubbed fetch.
 *
 *   - A spent idempotency key (CHECKOUT_ATTEMPT_NOT_REUSABLE /
 *     CHECKOUT_CART_CHANGED) is replaced and create-order retried exactly once.
 *   - PAYMENT_IN_PROGRESS keeps the attempt id and never asks for a removal.
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import {
  useCheckoutPayment,
  type CheckoutOrderPayload,
} from "@/lib/checkout/use-checkout-payment";
import { getCheckoutAttempt } from "@/lib/checkout/checkout-attempt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload: CheckoutOrderPayload = {
  items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
  shippingAddress: {
    city: "Kochi",
    country: "India",
    email: "buyer@example.com",
    line1: "1 Marine Drive",
    name: "Test Buyer",
    phone: "+919876543210",
    postalCode: "682001",
  },
  shippingMethod: "standard",
};

type HookApi = ReturnType<typeof useCheckoutPayment>;

let hook: HookApi | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const api = useCheckoutPayment();
  // Published after commit, so tests read the latest rendered hook state.
  useEffect(() => {
    hook = api;
  });
  return null;
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const createOrderBody = (call: unknown[]) =>
  JSON.parse(String((call[1] as RequestInit).body)) as {
    checkoutAttemptId: string;
  };

/** The modal path needs no navigation, which jsdom cannot perform. */
class FakeRazorpay {
  static instances: Array<{ options: Record<string, unknown> }> = [];
  constructor(public options: Record<string, unknown>) {
    FakeRazorpay.instances.push(this);
  }
  on() {}
  open() {}
}

const orderResponse = (orderId: string) =>
  jsonResponse(200, {
    amountPaise: 1_500_000,
    currency: "INR",
    orderId,
    razorpayKeyId: "rzp_test_key_id",
    razorpayOrderId: `order_${orderId}`,
  });

const fetchMock = vi.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
  FakeRazorpay.instances = [];
  (window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness />);
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  hook = null;
  vi.unstubAllGlobals();
});

const startPayment = async (
  onAvailabilityError = vi.fn(),
) => {
  await act(async () => {
    await hook!.startPayment({
      description: "Order for 1 piece",
      onAvailabilityError,
      onPaid: vi.fn(),
      payload,
      prefill: { contact: "", email: "buyer@example.com", name: "Test Buyer" },
    });
  });
  return onAvailabilityError;
};

describe("useCheckoutPayment — spent checkout attempts", () => {
  it.each(["CHECKOUT_ATTEMPT_NOT_REUSABLE", "CHECKOUT_CART_CHANGED"])(
    "replaces the attempt and retries create-order once after %s",
    async (code) => {
      const staleAttempt = getCheckoutAttempt(payload).checkoutAttemptId;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { code, message: "Try again." }))
        .mockResolvedValueOnce(orderResponse("order-2"));

      const onAvailabilityError = await startPayment();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [first, second] = fetchMock.mock.calls.map(createOrderBody);
      expect(first.checkoutAttemptId).toBe(staleAttempt);
      expect(second.checkoutAttemptId).not.toBe(staleAttempt);
      // The retried request is the one that opens payment.
      expect(FakeRazorpay.instances).toHaveLength(1);
      expect(FakeRazorpay.instances[0].options.order_id).toBe("order_order-2");
      expect(onAvailabilityError).not.toHaveBeenCalled();
      expect(hook!.error).toBeNull();
    },
  );

  it("stops after one automatic retry and leaves no spent attempt behind", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(409, { code: "CHECKOUT_CART_CHANGED", message: "Changed." }),
    );

    await startPayment();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map(createOrderBody);
    expect(second.checkoutAttemptId).not.toBe(first.checkoutAttemptId);
    // The next click starts from a fresh key rather than either refused one.
    const next = getCheckoutAttempt(payload).checkoutAttemptId;
    expect([first.checkoutAttemptId, second.checkoutAttemptId]).not.toContain(next);
    expect(FakeRazorpay.instances).toHaveLength(0);
    expect(hook!.error).not.toBeNull();
  });
});

describe("useCheckoutPayment — payment already in progress", () => {
  it("keeps the attempt, reports a non-removing conflict and does not retry", async () => {
    const attempt = getCheckoutAttempt(payload).checkoutAttemptId;
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        code: "PAYMENT_IN_PROGRESS",
        details: { productId: payload.items[0].productId },
        message: "A payment for this piece is already in progress.",
      }),
    );

    const onAvailabilityError = await startPayment();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createOrderBody(fetchMock.mock.calls[0]).checkoutAttemptId).toBe(attempt);
    // Only this key may resume the open payment, so it must survive.
    expect(getCheckoutAttempt(payload).checkoutAttemptId).toBe(attempt);
    expect(onAvailabilityError).toHaveBeenCalledTimes(1);
    const [{ code, copy, productId }] = onAvailabilityError.mock.calls[0];
    expect(code).toBe("PAYMENT_IN_PROGRESS");
    expect(productId).toBe(payload.items[0].productId);
    expect(copy.removeProduct).toBe(false);
    expect(copy.blockPayment).toBe(true);
    expect(FakeRazorpay.instances).toHaveLength(0);
  });

  it.each(["RAZORPAY_AUTH_FAILED", "RAZORPAY_PAYMENT_LINK_REJECTED"])(
    "clears the attempt without retrying after %s",
    async (code) => {
      const attempt = getCheckoutAttempt(payload).checkoutAttemptId;
      fetchMock.mockResolvedValue(jsonResponse(502, { code, message: "No." }));

      await startPayment();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getCheckoutAttempt(payload).checkoutAttemptId).not.toBe(attempt);
    },
  );
});
