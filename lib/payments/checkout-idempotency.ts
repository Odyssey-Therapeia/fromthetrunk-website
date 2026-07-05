/**
 * Payment reliability: server-side create-order idempotency.
 *
 * Reuses the existing `events` table (unique `event_id`, the same mechanism the
 * Razorpay webhook uses via claimEvent) to remember which order + payment link a
 * given client `checkoutAttemptId` produced. On a retry/abort/refresh of the
 * SAME checkout attempt we return the first order's payment link instead of
 * creating a duplicate pending order and stock hold.
 *
 * This needs NO schema migration. A stronger, fully race-proof version keyed on
 * a dedicated `orders.idempotency_key` unique column is written up separately in
 * PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md (approval-gated).
 *
 * Safety model: the attempt is recorded only AFTER the order + payment link are
 * successfully created, so a mid-creation failure leaves no marker and a retry
 * simply creates a fresh order (no stuck state). The reuse read re-validates the
 * order is still this user's, still `pending`, still has a Razorpay link, and is
 * not past its hold expiry — a paid/failed/expired order is never reused.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { claimEvent, getEventByEventId } from "@/db/queries/events";
import { orders } from "@/db/schema";
import { createOrderAccessToken } from "@/lib/orders/order-access-token";

const ATTEMPT_EVENT_PREFIX = "checkout_attempt:";

const attemptEventId = (attemptId: string) => `${ATTEMPT_EVENT_PREFIX}${attemptId}`;

type StoredAttempt = {
  orderId?: string;
  paymentLinkId?: string;
  paymentLinkUrl?: string;
  amountPaise?: number;
  currency?: string;
  expiresAt?: string;
  cartFingerprint?: string | null;
  userId?: string;
};

/** Response shape reused from the create-order success payload. */
export type ReusablePaymentOrder = {
  amountPaise: number;
  amount: number;
  currency: string;
  orderAccessToken: string;
  order_id: string;
  orderId: string;
  paymentLinkId: string;
  paymentLinkUrl: string;
  razorpayKeyId: string | undefined;
  razorpayOrderId: string;
  reused: true;
};

/**
 * Returns a still-valid pending order + payment link for this attempt id, or
 * null when there is nothing safe to reuse (so the caller creates a new order).
 */
export async function findReusablePaymentOrder(params: {
  attemptId: string;
  cartFingerprint: string | null;
  userId: string;
  nowMs?: number;
}): Promise<ReusablePaymentOrder | null> {
  const { attemptId, cartFingerprint, userId } = params;
  const nowMs = params.nowMs ?? Date.now();

  const event = await getEventByEventId(attemptEventId(attemptId));
  const stored = (event?.payload ?? null) as StoredAttempt | null;
  if (!stored?.orderId || !stored.paymentLinkUrl) return null;

  // Defense in depth: the recorded owner + cart must match this request.
  if (stored.userId && stored.userId !== userId) return null;
  if (
    cartFingerprint &&
    stored.cartFingerprint &&
    stored.cartFingerprint !== cartFingerprint
  ) {
    return null;
  }

  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, stored.orderId))
    .limit(1);
  if (!existing) return null;
  if (existing.userId !== userId) return null;
  // Only a still-pending order with a live Razorpay link is reusable.
  if (existing.paymentStatus !== "pending") return null;
  if (!existing.razorpayOrderId) return null;

  const expiresAtMs = stored.expiresAt ? new Date(stored.expiresAt).getTime() : 0;
  if (!(expiresAtMs > nowMs)) return null; // hold/link expired → don't reuse

  return {
    amountPaise: existing.totalPaise,
    amount: existing.totalPaise,
    currency: stored.currency ?? "INR",
    orderAccessToken: createOrderAccessToken(existing.id),
    order_id: existing.razorpayOrderId,
    orderId: existing.id,
    paymentLinkId: stored.paymentLinkId ?? existing.razorpayOrderId,
    paymentLinkUrl: stored.paymentLinkUrl,
    razorpayKeyId:
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
    razorpayOrderId: existing.razorpayOrderId,
    reused: true,
  };
}

/**
 * Records the order + payment link a successful create-order produced, so a
 * later retry with the same attempt id can reuse it. Best-effort: a conflicting
 * concurrent record (ON CONFLICT DO NOTHING inside claimEvent) is harmless.
 * No PII is stored — only ids, amount, currency, and the hold expiry.
 */
export async function recordPaymentAttempt(params: {
  attemptId: string;
  cartFingerprint: string | null;
  userId: string;
  orderId: string;
  paymentLinkId: string;
  paymentLinkUrl: string;
  amountPaise: number;
  currency: string;
  expiresAt: Date;
}): Promise<void> {
  const payload: StoredAttempt = {
    orderId: params.orderId,
    paymentLinkId: params.paymentLinkId,
    paymentLinkUrl: params.paymentLinkUrl,
    amountPaise: params.amountPaise,
    currency: params.currency,
    expiresAt: params.expiresAt.toISOString(),
    cartFingerprint: params.cartFingerprint,
    userId: params.userId,
  };

  await claimEvent({
    eventId: attemptEventId(params.attemptId),
    type: "checkout_attempt_created",
    occurredAt: new Date(),
    payload: payload as Record<string, unknown>,
  });
}
