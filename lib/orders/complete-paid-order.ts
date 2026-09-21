import { addOrderEvent, getOrder } from "@/db/queries/orders";
import { consentFromRecord } from "@/lib/analytics/server-consent";
import { incrementDiscountUsage } from "@/db/queries/discounts";
import { completePaidCommerceState } from "@/db/queries/user-cart";
import { getOrderNotificationRecipients } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/send";
import {
  orderConfirmationEmail,
  orderPurchaseNotificationEmail,
  type EmailOrder,
} from "@/lib/email/templates";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { revalidateProductsCache } from "@/lib/cache/product-cache";

type CompletePaidOrderInput = {
  orderId: string;
  paidAt?: Date;
  paymentId: string;
  paymentMethod?: null | string;
  paymentReference?: null | string;
  paymentUrl?: null | string;
  source: string;
};

const toEmailOrder = (order: NonNullable<Awaited<ReturnType<typeof getOrder>>>): EmailOrder => ({
  id: order.id,
  items: order.items.map((item) => ({
    name: item.name,
    price: item.pricePaise / 100,
    quantity: item.quantity,
    selectedOptions: item.selectedOptions,
  })),
  paidAt: order.paidAt,
  paymentId: order.paymentId,
  paymentStatus: order.paymentStatus,
  shippingAddress: {
    city: order.shippingCity,
    country: order.shippingCountry,
    email: order.shippingEmail,
    line1: order.shippingLine1,
    line2: order.shippingLine2,
    name: order.shippingName,
    phone: order.shippingPhone,
    postalCode: order.shippingPostalCode,
    state: order.shippingState,
  },
  shippingCost: order.shippingCostPaise / 100,
  subtotal: order.subtotalPaise / 100,
  taxAmount: order.taxAmountPaise / 100,
  total: order.totalPaise / 100,
  discountCode: order.discountCode,
});

const sendPurchaseEmails = async (
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  payment: CompletePaidOrderInput
) => {
  const emailOrder = toEmailOrder(order);

  if (order.shippingEmail) {
    const customerEmail = orderConfirmationEmail(emailOrder);
    await sendEmail({
      to: order.shippingEmail,
      subject: customerEmail.subject,
      html: customerEmail.html,
    });
  }

  const notificationEmail = orderPurchaseNotificationEmail(emailOrder, {
    paymentId: payment.paymentId,
    paymentMethod: payment.paymentMethod,
    paymentReference: payment.paymentReference,
    paymentUrl: payment.paymentUrl,
    source: payment.source,
  });

  await sendEmail({
    to: getOrderNotificationRecipients(),
    subject: notificationEmail.subject,
    html: notificationEmail.html,
  });
};

export async function completePaidOrder(input: CompletePaidOrderInput) {
  const existing = await getOrder(input.orderId);
  if (!existing) {
    throw new Error("Order not found.");
  }

  if (existing.paymentId && existing.paymentId !== input.paymentId) {
    throw new Error("PAYMENT_ID_MISMATCH");
  }

  const paidAt = input.paidAt ?? new Date();
  const productIds = existing.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  /*
   * This is the sole authoritative commit point. Order payment/confirmation,
   * one-of-one sale, exact payment reservation cleanup and the account bag are
   * one guarded SQL statement. The statement derives both the order product
   * set and its one-of-one subset from order_items + reservations, so a mutable
   * catalogue type cannot change what this payment owns. A failed inventory
   * guard changes none of them; an already-paid retry is read-only.
   */
  const commerce = await completePaidCommerceState({
    orderId: input.orderId,
    paidAt,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethod ?? "razorpay",
    updatedAt: new Date(),
    userId: existing.userId ?? null,
  });

  if (commerce.kind === "payment_conflict") {
    throw new Error("PAYMENT_ID_MISMATCH");
  }
  if (commerce.kind === "order_state_conflict") {
    // Money was captured against an order that is no longer pending (for
    // example, one reconciliation already failed). It cannot claim inventory,
    // so record it for a manual review or refund.
    await addOrderEvent(
      input.orderId,
      "Captured payment on non-pending order",
      existing.status ?? "pending",
      {
        code: "PAYMENT_ON_CLOSED_ORDER",
        paymentId: input.paymentId,
        paymentReference: input.paymentReference ?? null,
        previousPaymentStatus: existing.paymentStatus,
        source: input.source,
      },
    );
    throw new Error("PAYMENT_CLAIM_CONFLICT");
  }
  if (commerce.kind === "inventory_conflict") {
    await addOrderEvent(
      input.orderId,
      "Payment completion inventory conflict",
      existing.status ?? "pending",
      {
        code: "PRODUCT_SOLD",
        requestedProductIds: productIds,
        soldCount: commerce.soldCount,
      },
    );
    throw new Error("PRODUCT_SOLD");
  }
  if (commerce.kind === "already_paid") {
    const current = await getOrder(input.orderId);
    if (current?.paymentId && current.paymentId !== input.paymentId) {
      throw new Error("PAYMENT_ID_MISMATCH");
    }
    if (current?.paymentStatus !== "paid") {
      throw new Error("PAYMENT_CLAIM_CONFLICT");
    }
    return {
      alreadyPaid: true as const,
      emailsSent: false,
      order: current,
    };
  }

  if (commerce.soldSlugs.length > 0) {
    revalidateProductsCache(commerce.soldSlugs);
  }

  await addOrderEvent(input.orderId, `${input.source} payment confirmed`, "confirmed", {
    paymentId: input.paymentId,
    paymentReference: input.paymentReference ?? null,
  });

  // P6-02: Increment discount usageCount atomically now that payment is confirmed.
  // Uses conditional UPDATE: SET usage_count = usage_count + 1 WHERE usage_count < usage_limit
  // (or usage_limit IS NULL). The conditional guard closes the stale-read over-redemption
  // window: if the code was exhausted between create-order and payment confirmation,
  // incrementDiscountUsage returns false and we log an order event for review.
  // Only the atomic commerce winner reaches here, so this
  // call executes EXACTLY ONCE per order — no double-counting across concurrent callbacks.
  if (existing.discountId) {
    const incremented = await incrementDiscountUsage(existing.discountId);
    if (!incremented) {
      // The usage limit was exhausted between validation and confirmation (race condition).
      // Log for review; the order is still fulfilled — do not block the customer.
      await addOrderEvent(
        input.orderId,
        `discount_usage_limit_exceeded: discount ${existing.discountId} could not be incremented (limit already reached at confirmation time)`,
        "confirmed",
        { discountId: existing.discountId }
      );
    }
  }

  // Fire-and-forget: payment_completed event — winner branch only (EXACTLY ONCE).
  // emitAnalyticsEvent() never throws; errors are caught + logged inside.
  void emitAnalyticsEvent({
    /*
     * Payment can complete here with no browser attached — a Razorpay webhook,
     * or the expiry reconciler. The consent recorded on the order when the
     * shopper placed it is the only honest source, and a NULL column (an order
     * from before we recorded it) reads as refusal, so Google and Meta receive
     * nothing unless the shopper actually agreed.
     */
    consent: consentFromRecord(existing),
    event_id: crypto.randomUUID(),
    type: "payment_completed",
    payload: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      paymentMethod: input.paymentMethod ?? "razorpay",
      paymentReference: input.paymentReference ?? null,
      source: input.source,
      productIds,
    },
    occurredAt: new Date(),
  });

  const confirmed = await getOrder(input.orderId);
  if (!confirmed) {
    throw new Error("Failed to load confirmed order.");
  }

  await sendPurchaseEmails(confirmed, input);

  return {
    alreadyPaid: false as const,
    emailsSent: true,
    order: confirmed,
  };
}
