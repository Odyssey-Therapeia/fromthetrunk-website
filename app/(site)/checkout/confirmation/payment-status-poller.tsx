"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PaymentStatus = "failed" | "paid" | "pending" | "refunded";

type PaymentStatusPollerProps = {
  accessKey?: string;
  initialPaymentStatus: PaymentStatus;
  orderId: string;
};

type PaymentStatusResponse = {
  paymentStatus?: PaymentStatus;
  retryAfterSeconds?: number | null;
};

export function PaymentStatusPoller({
  accessKey,
  initialPaymentStatus,
  orderId,
}: PaymentStatusPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus>(initialPaymentStatus);
  const [attempts, setAttempts] = useState(0);

  const statusUrl = useMemo(() => {
    const params = new URLSearchParams({ orderId });
    if (accessKey) params.set("key", accessKey);
    return `/api/v2/payments/status?${params.toString()}`;
  }, [accessKey, orderId]);

  useEffect(() => {
    if (status !== "pending" || attempts >= 6) return;

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(statusUrl, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setAttempts((value) => value + 1);
          return;
        }

        const data = (await response.json()) as PaymentStatusResponse;
        if (data.paymentStatus && data.paymentStatus !== status) {
          setStatus(data.paymentStatus);
          router.refresh();
          return;
        }
      } finally {
        setAttempts((value) => value + 1);
      }
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [attempts, router, status, statusUrl]);

  if (status === "failed") {
    return (
      <p className="mt-3 text-sm font-medium text-red-700">
        Payment failed. No paid receipt has been generated.
      </p>
    );
  }

  if (status === "paid") {
    return (
      <p className="mt-3 text-sm font-medium text-emerald-700">
        Payment confirmed. Updating your order page.
      </p>
    );
  }

  return (
    <p className="mt-3 text-sm text-ftt-burgundy/65">
      Verifying payment with Razorpay. This page will update automatically.
    </p>
  );
}
