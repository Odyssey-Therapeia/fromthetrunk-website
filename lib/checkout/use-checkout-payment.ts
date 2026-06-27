"use client";

/**
 * Encapsulates the Razorpay payment lifecycle so the checkout orchestrator
 * stays focused on step UI. The behaviour mirrors the original inline flow
 * exactly: create-order → (a) redirect to the Razorpay payment link if one is
 * returned, or (b) open the Razorpay modal and verify the signature — then hand
 * the confirmation path back to the caller via `onPaid`.
 */

import { useState } from "react";
import { toast } from "sonner";

import {
  getAvailabilityErrorMessage,
  isAvailabilityErrorCode,
  type AvailabilityErrorCode,
} from "@/lib/cart/availability-errors";

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
  isGift?: boolean;
  giftFrom?: string;
  giftMessage?: string;
};

type StartPaymentArgs = {
  payload: CheckoutOrderPayload;
  prefill: { name: string; email: string; contact: string };
  description: string;
  onPaid: (confirmationPath: string) => void;
  onAvailabilityError?: (error: {
    code: AvailabilityErrorCode;
    productId?: string;
    message: string;
  }) => void;
};

const confirmationPath = (orderId: string, accessToken?: string) =>
  accessToken
    ? `/checkout/confirmation?orderId=${orderId}&key=${accessToken}`
    : `/checkout/confirmation?orderId=${orderId}`;

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

const loadRazorpayScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }

    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`,
    );

    const handleLoad = () => resolve();
    const handleError = () =>
      reject(
        new Error("Payment system could not load. Please refresh and try again."),
      );

    if (!script) {
      script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });

export function useCheckoutPayment() {
  const [isPaymentScriptReady, setIsPaymentScriptReady] = useState(false);
  const [paymentScriptError, setPaymentScriptError] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPayment = async ({
    payload,
    prefill,
    description,
    onAvailabilityError,
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
        const errorData = (await createResponse.json().catch(() => null)) as {
          code?: string;
          details?: { productId?: string };
          message?: string;
        } | null;
        if (isAvailabilityErrorCode(errorData?.code)) {
          const message = getAvailabilityErrorMessage(
            errorData?.code,
            errorData?.message,
          );
          onAvailabilityError?.({
            code: errorData.code,
            message,
            productId: errorData.details?.productId,
          });
          throw new Error(message);
        }

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
      if (!window.Razorpay) {
        try {
          await loadRazorpayScript();
          setPaymentScriptError(null);
          setIsPaymentScriptReady(true);
        } catch (scriptError) {
          const message =
            scriptError instanceof Error
              ? scriptError.message
              : "Payment system could not load. Please refresh and try again.";
          setIsPaymentScriptReady(false);
          setPaymentScriptError(message);
          throw new Error(message);
        }
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
