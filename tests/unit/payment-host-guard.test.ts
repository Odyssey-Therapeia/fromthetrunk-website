import { afterEach, describe, expect, it } from "vitest";

import {
  evaluatePaymentHost,
  isLiveRazorpayMode,
  isUnsafeLiveHost,
} from "@/lib/payments/payment-host-guard";

const KEYS = [
  "RAZORPAY_KEY_ID",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "ALLOW_UNSAFE_LIVE_PAYMENTS",
] as const;

const snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  for (const key of KEYS) restore(key, snapshot[key]);
});

const setLive = () => {
  process.env.RAZORPAY_KEY_ID = "rzp_live_example";
  delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  delete process.env.ALLOW_UNSAFE_LIVE_PAYMENTS;
};
const setTest = () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  delete process.env.ALLOW_UNSAFE_LIVE_PAYMENTS;
};

describe("payment-host-guard", () => {
  it("allows TEST-mode payments on any host (preview, localhost, prod)", () => {
    setTest();
    expect(
      evaluatePaymentHost(
        "https://fromthetrunk-website.vercel.app/api/v2/payments/create-order",
      ).allowed,
    ).toBe(true);
    expect(evaluatePaymentHost("http://localhost:3000/x").allowed).toBe(true);
    expect(
      evaluatePaymentHost("https://www.fromthetrunk.shop/x").allowed,
    ).toBe(true);
  });

  it("blocks LIVE-mode payments on *.vercel.app and localhost", () => {
    setLive();
    const preview = evaluatePaymentHost(
      "https://staging-abc.vercel.app/api/v2/payments/create-order",
    );
    expect(preview.allowed).toBe(false);
    if (!preview.allowed) {
      expect(preview.reason).toBe("LIVE_PAYMENT_ON_UNSAFE_HOST");
    }
    expect(evaluatePaymentHost("http://localhost:3000/x").allowed).toBe(false);
    expect(evaluatePaymentHost("http://127.0.0.1:3000/x").allowed).toBe(false);
  });

  it("allows LIVE-mode payments on the real custom production domain", () => {
    setLive();
    expect(
      evaluatePaymentHost(
        "https://www.fromthetrunk.shop/api/v2/payments/create-order",
      ).allowed,
    ).toBe(true);
  });

  it("honours the explicit ALLOW_UNSAFE_LIVE_PAYMENTS override", () => {
    setLive();
    process.env.ALLOW_UNSAFE_LIVE_PAYMENTS = "true";
    expect(evaluatePaymentHost("https://x.vercel.app/y").allowed).toBe(true);
  });

  it("classifies unsafe hosts including ports", () => {
    expect(isUnsafeLiveHost("localhost:3000")).toBe(true);
    expect(isUnsafeLiveHost("abc.vercel.app")).toBe(true);
    expect(isUnsafeLiveHost("127.0.0.1:5173")).toBe(true);
    expect(isUnsafeLiveHost("www.fromthetrunk.shop")).toBe(false);
    expect(isUnsafeLiveHost("fromthetrunk.shop")).toBe(false);
  });

  it("detects live vs test mode from the key prefix", () => {
    setLive();
    expect(isLiveRazorpayMode()).toBe(true);
    setTest();
    expect(isLiveRazorpayMode()).toBe(false);
  });
});
