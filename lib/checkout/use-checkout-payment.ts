"use client";

/**
 * Encapsulates the Razorpay payment lifecycle so the checkout orchestrator
 * stays focused on step UI. The behaviour mirrors the original inline flow
 * exactly: create-order → (a) redirect to the Razorpay payment link if one is
 * returned, or (b) open the Razorpay modal and verify the signature — then hand
 * the confirmation path back to the caller via `onPaid`.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";

type CreatePaymentOrderResponse = {
  amount?: number;
  amountPaise: number;
  currency: string;
  orderAccessToken?: string;
  orderId: string;
  paymentLinkUrl?: string;
  razorpayKeyId?: string;
  razorpayOrderId: string;
};

type RazorpaySuccessResponse = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

type RazorpayFailureResponse = {
  error?: { description?: string; reason?: string };
};

type RazorpayOptions = {
  amount: number;
  currency: string;
  description: string;
  handler: (response: RazorpaySuccessResponse) => Promise<void>;
  key: string;
  modal: { ondismiss: () => void };
  name: string;
  order_id: string;
  prefill: { contact: string; email: string; name: string };
  theme: { color: string };
};

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (
        event: "payment.failed",
        handler: (response: RazorpayFailureResponse) => void,
      ) => void;
    };
  }
}

export type CheckoutOrderPayload = {
  items: Array<{ productId: string; quantity: number; reservationToken?: string }>;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    phone?: string;
    email: string;
  };
  shippingMethod: string;
  discountCode?: string;
};

type StartPaymentArgs = {
  payload: CheckoutOrderPayload;
  prefill: { name: string; email: string; contact: string };
  description: string;
  onPaid: (confirmationPath: string) => void;
};

const confirmationPath = (orderId: string, accessToken?: string) =>
  accessToken
    ? `/checkout/confirmation?orderId=${orderId}&key=${accessToken}`
    : `/checkout/confirmation?orderId=${orderId}`;

export function useCheckoutPayment() {
  const [isPaymentScriptReady, setIsPaymentScriptReady] = useState(false);
  const [paymentScriptError, setPaymentScriptError] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.Razorpay) {
      const readyTimer = window.setTimeout(() => setIsPaymentScriptReady(true), 0);
      return () => window.clearTimeout(readyTimer);
    }

    const scriptSrc = "https://checkout.razorpay.com/v1/checkout.js";
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`,
    );
    const wasExistingScript = Boolean(script);

    if (!script) {
      script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      document.body.appendChild(script);
    }

    const handleLoad = () => {
      setPaymentScriptError(null);
      setIsPaymentScriptReady(true);
    };
    const handleError = () => {
      setIsPaymentScriptReady(false);
      setPaymentScriptError(
        "Payment system could not load. Please refresh and try again.",
      );
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    return () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      if (!wasExistingScript && script.parentElement) {
        script.parentElement.removeChild(script);
      }
    };
  }, []);

  const startPayment = async ({
    payload,
    prefill,
    description,
    onPaid,
  }: StartPaymentArgs) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const createResponse = await fetch("/api/v2/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => null);
        throw new Error(errorData?.message || "Unable to create order.");
      }

      const orderData = (await createResponse.json()) as CreatePaymentOrderResponse;

      // Primary path: the backend returns a hosted Razorpay payment link.
      if (orderData.paymentLinkUrl) {
        window.location.assign(orderData.paymentLinkUrl);
        return;
      }

      // Fallback path: open the Razorpay modal in-page and verify the signature.
      if (paymentScriptError) throw new Error(paymentScriptError);
      if (!isPaymentScriptReady || !window.Razorpay) {
        throw new Error(
          "Payment system is still loading. Please try again in a moment.",
        );
      }

      const razorpayKeyId =
        orderData.razorpayKeyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKeyId) throw new Error("Razorpay key is not configured.");

      const options: RazorpayOptions = {
        key: razorpayKeyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: "FTT Luxury Group",
        description,
        order_id: orderData.razorpayOrderId,
        prefill,
        theme: { color: "#601D1C" },
        handler: async (response) => {
          try {
            const {
              razorpay_order_id: razorpayOrderId,
              razorpay_payment_id: razorpayPaymentId,
              razorpay_signature: razorpaySignature,
            } = response;

            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
              throw new Error("Razorpay returned an incomplete payment response.");
            }

            const verifyResponse = await fetch("/api/v2/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: orderData.orderId,
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
              }),
            });

            if (!verifyResponse.ok) {
              const errorData = await verifyResponse.json().catch(() => null);
              throw new Error(errorData?.message || "Payment verification failed.");
            }

            onPaid(confirmationPath(orderData.orderId, orderData.orderAccessToken));
          } catch {
            setError(
              "Payment was received but verification failed. Please contact support.",
            );
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsSubmitting(false);
            toast("Payment was cancelled.");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        setError(
          response.error?.description ||
            response.error?.reason ||
            "Payment failed. Please try again.",
        );
        setIsSubmitting(false);
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process payment.");
      setIsSubmitting(false);
    }
  };

  return {
    isPaymentScriptReady,
    paymentScriptError,
    isSubmitting,
    error,
    setError,
    startPayment,
  };
}
