import { addOrderEvent, getOrder } from "@/db/queries/orders";
import {
  getPaymentHoldCandidateForOrder,
  listExpiredPaymentHoldCandidates,
  releasePaymentCartItems,
  type PaymentCartRestoration,
  type PaymentHoldCandidate,
  type ReleasePaymentCartItemsResult,
} from "@/db/queries/user-cart";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";
import {
  cancelRazorpayPaymentLink,
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  fetchRazorpayPaymentLink,
  getRazorpayPaymentLinkReferenceId,
  isRazorpayBadRequest,
  lookupRazorpayPaymentLinkByReferenceId,
  type RazorpayPaymentLinkResponse,
  type RazorpayPaymentResponse,
} from "@/lib/payments/razorpay";
import { createLogger } from "@/lib/log";

const log = createLogger("payments:expired-hold-reconciliation");

type ProviderDecision =
  | {
      kind: "complete";
      payment: RazorpayPaymentResponse;
      paymentReference: string;
      paymentUrl: string | null;
    }
  | { kind: "defer"; reason: string }
  | { kind: "release"; reason: string };

/** What one pending payment hold became once Razorpay's state was read. */
export type PaymentHoldResolution =
  | { kind: "completed" }
  | { kind: "deferred"; reason: string }
  | {
      kind: "released";
      releasedProductIds: string[];
      releasedSlugs: string[];
      restoredProductIds: string[];
      restoredSlugs: string[];
    };

export type PaymentHoldOrderReconciliation =
  | PaymentHoldResolution
  | { kind: "conflict"; protectedProductIds: string[] }
  | { kind: "none" };

export type ExpiredPaymentHoldReconciliation = {
  checked: number;
  completedOrderIds: string[];
  conflictOrderIds: string[];
  deferredOrderIds: string[];
  protectedProductIds: string[];
  releasedOrderIds: string[];
  releasedProductIds: string[];
  releasedSlugs: string[];
  restoredProductIds: string[];
  restoredSlugs: string[];
};

const asPaise = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const paidAtFromUnixSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1_000)
    : undefined;

const isCapturedPayment = (payment: RazorpayPaymentResponse) =>
  payment.status === "captured" && payment.captured !== false;

const validateCapturedPayment = (
  candidate: PaymentHoldCandidate,
  payment: RazorpayPaymentResponse,
  expectedOrderId?: string,
) =>
  payment.id.length > 0 &&
  isCapturedPayment(payment) &&
  payment.currency === "INR" &&
  payment.amount === candidate.totalPaise &&
  (!expectedOrderId || payment.order_id === expectedOrderId);

const paymentLinkPayments = (paymentLink: RazorpayPaymentLinkResponse) => {
  if (!paymentLink.payments) return [];
  return Array.isArray(paymentLink.payments)
    ? paymentLink.payments
    : [paymentLink.payments];
};

async function inspectPaymentLink(
  candidate: PaymentHoldCandidate,
  paymentLink: RazorpayPaymentLinkResponse,
  now: Date,
  expectedPaymentLinkId?: string,
  mayCancel = true,
): Promise<ProviderDecision> {
  const expectedReference = getRazorpayPaymentLinkReferenceId(candidate.orderId);
  if (
    (expectedPaymentLinkId && paymentLink.id !== expectedPaymentLinkId) ||
    paymentLink.reference_id !== expectedReference ||
    paymentLink.currency !== "INR" ||
    asPaise(paymentLink.amount) !== candidate.totalPaise
  ) {
    return { kind: "defer", reason: "PAYMENT_LINK_IDENTITY_MISMATCH" };
  }

  const embeddedPayments = paymentLinkPayments(paymentLink);
  if (paymentLink.status === "paid") {
    if (asPaise(paymentLink.amount_paid) !== candidate.totalPaise) {
      return { kind: "defer", reason: "PAYMENT_LINK_PAID_AMOUNT_MISMATCH" };
    }

    const embedded = embeddedPayments.find(
      (payment) =>
        payment.payment_id &&
        payment.plink_id === paymentLink.id &&
        payment.status === "captured" &&
        asPaise(payment.amount) === candidate.totalPaise,
    );
    if (!embedded?.payment_id) {
      return { kind: "defer", reason: "CAPTURED_PAYMENT_NOT_LISTED" };
    }

    const payment = await fetchRazorpayPayment(embedded.payment_id);
    if (
      payment.id !== embedded.payment_id ||
      !validateCapturedPayment(candidate, payment)
    ) {
      return { kind: "defer", reason: "CAPTURED_PAYMENT_MISMATCH" };
    }

    return {
      kind: "complete",
      payment,
      paymentReference: paymentLink.id,
      paymentUrl: paymentLink.short_url || null,
    };
  }

  if (paymentLink.status === "cancelled" || paymentLink.status === "expired") {
    const hasCaptureSignal = embeddedPayments.some(
      (payment) =>
        payment.status === "captured" || payment.status === "authorized",
    );
    return asPaise(paymentLink.amount_paid) === 0 && !hasCaptureSignal
      ? { kind: "release", reason: `PAYMENT_LINK_${paymentLink.status.toUpperCase()}` }
      : { kind: "defer", reason: "TERMINAL_LINK_PAYMENT_AMBIGUOUS" };
  }

  if (
    paymentLink.status === "created" &&
    mayCancel &&
    candidate.reservedUntil.getTime() <= now.getTime()
  ) {
    /*
     * Razorpay keeps a link open for at least 15 minutes, so it can outlive
     * the server's payment deadline. Close it before the hold is restored or
     * released, so nobody can pay for a saree the order no longer holds.
     */
    let settled: RazorpayPaymentLinkResponse;
    try {
      settled = await cancelRazorpayPaymentLink(paymentLink.id);
    } catch (error) {
      if (!isRazorpayBadRequest(error)) {
        return { kind: "defer", reason: "PAYMENT_LINK_CANCEL_FAILED" };
      }
      // Razorpay refuses to cancel a link that was paid, expired or is mid
      // update. The re-read state decides; the cancel is never repeated.
      settled = await fetchRazorpayPaymentLink(paymentLink.id);
    }
    return inspectPaymentLink(candidate, settled, now, paymentLink.id, false);
  }

  return { kind: "defer", reason: "PAYMENT_LINK_NOT_TERMINAL" };
}

const inspectRazorpayOrder = async (
  candidate: PaymentHoldCandidate,
  providerOrderId: string,
): Promise<ProviderDecision> => {
  const providerOrder = await fetchRazorpayOrder(providerOrderId);
  if (
    providerOrder.id !== providerOrderId ||
    providerOrder.currency !== "INR" ||
    providerOrder.amount !== candidate.totalPaise
  ) {
    return { kind: "defer", reason: "RAZORPAY_ORDER_IDENTITY_MISMATCH" };
  }
  if (
    providerOrder.status !== "paid" ||
    providerOrder.amount_paid !== candidate.totalPaise
  ) {
    // Razorpay Orders do not expose the definitive cancelled/expired Payment
    // Link states required for release, so an unpaid legacy order stays held.
    return { kind: "defer", reason: "RAZORPAY_ORDER_NOT_VERIFIED_PAID" };
  }

  const payments = await fetchRazorpayOrderPayments(providerOrderId);
  const payment = payments.find((entry) =>
    validateCapturedPayment(candidate, entry, providerOrderId),
  );
  if (!payment) {
    return { kind: "defer", reason: "CAPTURED_PAYMENT_NOT_FOUND" };
  }

  return {
    kind: "complete",
    payment,
    paymentReference: providerOrderId,
    paymentUrl: null,
  };
};

const inspectProvider = async (
  candidate: PaymentHoldCandidate,
  now: Date,
): Promise<ProviderDecision> => {
  if (candidate.providerPaymentId?.startsWith("plink_")) {
    return inspectPaymentLink(
      candidate,
      await fetchRazorpayPaymentLink(candidate.providerPaymentId),
      now,
      candidate.providerPaymentId,
    );
  }

  if (candidate.providerPaymentId?.startsWith("order_")) {
    return inspectRazorpayOrder(candidate, candidate.providerPaymentId);
  }

  if (candidate.providerPaymentId) {
    return { kind: "defer", reason: "UNKNOWN_PROVIDER_REFERENCE" };
  }

  const reference = getRazorpayPaymentLinkReferenceId(candidate.orderId);
  const lookup = await lookupRazorpayPaymentLinkByReferenceId(reference);
  if (lookup.kind === "absent") {
    return { kind: "release", reason: "PAYMENT_LINK_CONFIRMED_ABSENT" };
  }
  if (lookup.kind === "ambiguous") {
    return { kind: "defer", reason: "PAYMENT_LINK_REFERENCE_AMBIGUOUS" };
  }
  return inspectPaymentLink(candidate, lookup.paymentLink, now);
};

/**
 * Decide one pending payment hold from Razorpay's state, then apply that
 * decision only through the exact atomic completion or release command.
 * Anything unproven or failed is deferred, and a deferred hold stays protected.
 */
async function resolvePaymentHoldCandidate(
  candidate: PaymentHoldCandidate,
  now: Date,
): Promise<PaymentHoldResolution> {
  let decision: ProviderDecision;
  try {
    decision = await inspectProvider(candidate, now);
  } catch (error) {
    log.warn("Provider lookup failed; payment hold remains protected", {
      error,
      orderId: candidate.orderId,
    });
    return { kind: "deferred", reason: "PROVIDER_LOOKUP_FAILED" };
  }

  if (decision.kind === "defer") {
    log.warn("Payment hold reconciliation deferred", {
      orderId: candidate.orderId,
      reason: decision.reason,
    });
    return { kind: "deferred", reason: decision.reason };
  }

  if (decision.kind === "complete") {
    try {
      await completePaidOrder({
        orderId: candidate.orderId,
        paidAt: paidAtFromUnixSeconds(decision.payment.created_at),
        paymentId: decision.payment.id,
        paymentMethod: decision.payment.method ?? "razorpay",
        paymentReference: decision.paymentReference,
        paymentUrl: decision.paymentUrl,
        source: "Razorpay expiry reconciliation",
      });
      return { kind: "completed" };
    } catch (error) {
      // completePaidOrder can finish the atomic commerce commit before a
      // best-effort email fails. Re-read once so the summary never reports a
      // safely completed sale as if its inventory were still pending.
      const current = await getOrder(candidate.orderId).catch(() => null);
      if (
        current?.paymentStatus === "paid" &&
        current.paymentId === decision.payment.id
      ) {
        return { kind: "completed" };
      }
      log.warn("Verified payment could not be committed", {
        error,
        orderId: candidate.orderId,
      });
      return { kind: "deferred", reason: "PAYMENT_COMPLETION_FAILED" };
    }
  }

  let restorationItems: PaymentCartRestoration[];
  try {
    restorationItems = candidate.items.map((item) => {
      const proof = verifyReservationToken(item.paymentReservationToken);
      if (
        proof?.productId !== item.productId ||
        proof.reservedUntil.getTime() !== candidate.reservedUntil.getTime()
      ) {
        throw new Error("PAYMENT_RESERVATION_TOKEN_INVALID");
      }
      return {
        cartDeadline: item.cartDeadline,
        paymentReservationToken: item.paymentReservationToken,
        productId: item.productId,
        // Signed for the original cart deadline only: an unpaid link hands
        // back the time that remained, never a fresh window.
        restorationReservationToken: createReservationToken({
          productId: item.productId,
          reservedUntil: item.cartDeadline,
        }),
      };
    });
  } catch (error) {
    log.warn("Payment hold token could not prove exact local authority", {
      error,
      orderId: candidate.orderId,
    });
    return { kind: "deferred", reason: "PAYMENT_RESERVATION_TOKEN_INVALID" };
  }

  let released: ReleasePaymentCartItemsResult;
  try {
    released = await releasePaymentCartItems({
      items: restorationItems,
      now,
      orderId: candidate.orderId,
      reservedUntil: candidate.reservedUntil,
      userId: candidate.userId,
    });
  } catch (error) {
    // The guarded statement did not report a commit, so the hold stays
    // protected and only this order waits for the next attempt.
    log.warn("Provider-authorized release failed; payment hold remains protected", {
      error,
      orderId: candidate.orderId,
    });
    return { kind: "deferred", reason: "PAYMENT_RELEASE_FAILED" };
  }
  if (released.kind !== "released") {
    log.warn("Provider-authorized release lost its exact local guard", {
      kind: released.kind,
      orderId: candidate.orderId,
    });
    return {
      kind: "deferred",
      reason: `PAYMENT_RELEASE_${released.kind.toUpperCase()}`,
    };
  }

  try {
    await addOrderEvent(
      candidate.orderId,
      "Terminal unpaid payment hold resolved after Razorpay reconciliation",
      "pending",
      {
        reason: decision.reason,
        releasedProductIds: released.releasedProductIds,
        restoredProductIds: released.restoredProductIds,
      },
    );
  } catch (error) {
    // The exact release already committed; an audit insert must not turn a
    // safe inventory transition into a retryable provider decision.
    log.warn("Payment release audit event could not be written", {
      error,
      orderId: candidate.orderId,
    });
  }

  return {
    kind: "released",
    releasedProductIds: released.releasedProductIds,
    releasedSlugs: released.releasedSlugs,
    restoredProductIds: released.restoredProductIds,
    restoredSlugs: released.restoredSlugs,
  };
}

/**
 * Reconcile a bounded batch of locally expired payment holds against Razorpay.
 *
 * Provider calls happen only here and in reconcilePaymentHoldForOrder. Every
 * local mutation is still delegated to the exact atomic completion/release
 * helpers; provider errors, identity mismatches and non-terminal states are
 * read-only.
 */
export async function reconcileExpiredPaymentHolds({
  limit = 25,
  now = new Date(),
  productIds,
}: {
  limit?: number;
  now?: Date;
  productIds: string[];
}): Promise<ExpiredPaymentHoldReconciliation> {
  const scan = await listExpiredPaymentHoldCandidates({ limit, now, productIds });
  const completedOrderIds: string[] = [];
  const deferredOrderIds = new Set(scan.conflictOrderIds);
  const releasedOrderIds: string[] = [];
  const releasedProductIds = new Set<string>();
  const releasedSlugs = new Set<string>();
  const restoredProductIds = new Set<string>();
  const restoredSlugs = new Set<string>();

  for (const candidate of scan.candidates) {
    const resolution = await resolvePaymentHoldCandidate(candidate, now);
    if (resolution.kind === "completed") {
      completedOrderIds.push(candidate.orderId);
      continue;
    }
    if (resolution.kind === "deferred") {
      deferredOrderIds.add(candidate.orderId);
      continue;
    }

    releasedOrderIds.push(candidate.orderId);
    resolution.releasedProductIds.forEach((id) => releasedProductIds.add(id));
    resolution.releasedSlugs.forEach((slug) => releasedSlugs.add(slug));
    resolution.restoredProductIds.forEach((id) => restoredProductIds.add(id));
    resolution.restoredSlugs.forEach((slug) => restoredSlugs.add(slug));
  }

  return {
    checked: scan.candidates.length,
    completedOrderIds,
    conflictOrderIds: scan.conflictOrderIds,
    deferredOrderIds: [...deferredOrderIds],
    protectedProductIds: scan.protectedProductIds,
    releasedOrderIds,
    releasedProductIds: [...releasedProductIds],
    releasedSlugs: [...releasedSlugs],
    restoredProductIds: [...restoredProductIds],
    restoredSlugs: [...restoredSlugs],
  };
}

/**
 * Reconcile one pending order as soon as Razorpay reports its link terminal,
 * so an unpaid link hands back the remaining cart time without waiting for
 * the scheduled run. The link is re-read from Razorpay here; a webhook
 * payload alone never releases anything.
 */
export async function reconcilePaymentHoldForOrder({
  now,
  orderId,
}: {
  now: Date;
  orderId: string;
}): Promise<PaymentHoldOrderReconciliation> {
  const lookup = await getPaymentHoldCandidateForOrder(orderId);
  if (lookup.kind === "none") return { kind: "none" };
  if (lookup.kind === "conflict") {
    log.warn("Payment hold is locally inconsistent; it remains protected", {
      orderId,
      protectedProductIds: lookup.protectedProductIds,
    });
    return {
      kind: "conflict",
      protectedProductIds: lookup.protectedProductIds,
    };
  }
  return resolvePaymentHoldCandidate(lookup.candidate, now);
}
