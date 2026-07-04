import { afterEach, describe, expect, it } from "vitest";

import { shouldNotifyRazorpayCustomer } from "@/lib/payments/razorpay";

const KEYS = [
  "RAZORPAY_KEY_ID",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "ALLOW_UNSAFE_LIVE_PAYMENTS",
] as const;

const snapshot = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  for (const key of KEYS) restore(key, snapshot[key]);
});

const setTestMode = () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_example";
  delete process.env.ALLOW_UNSAFE_LIVE_PAYMENTS;
};

const setLiveMode = () => {
  process.env.RAZORPAY_KEY_ID = "rzp_live_example";
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_live_example";
  delete process.env.ALLOW_UNSAFE_LIVE_PAYMENTS;
};

describe("shouldNotifyRazorpayCustomer", () => {
  it("disables customer notifications in test mode, even on production host", () => {
    setTestMode();

    expect(
      shouldNotifyRazorpayCustomer({
        callbackUrl: "https://www.fromthetrunk.shop/api/v2/payments/payment-link/callback",
      }),
    ).toBe(false);
  });

  it("disables customer notifications on localhost and Vercel hosts", () => {
    setLiveMode();

    expect(
      shouldNotifyRazorpayCustomer({
        callbackUrl: "http://localhost:3000/api/v2/payments/payment-link/callback",
      }),
    ).toBe(false);
    expect(
      shouldNotifyRazorpayCustomer({
        callbackUrl: "https://fromthetrunk-website.vercel.app/api/v2/payments/payment-link/callback",
      }),
    ).toBe(false);
  });

  it("enables customer notifications only for the live production custom domain", () => {
    setLiveMode();

    expect(
      shouldNotifyRazorpayCustomer({
        callbackUrl: "https://www.fromthetrunk.shop/api/v2/payments/payment-link/callback",
      }),
    ).toBe(true);
  });
});
