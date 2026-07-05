import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { addOrderEvent, getOrder } from "@/db/queries/orders";
import { incrementDiscountUsage } from "@/db/queries/discounts";
import { releaseReservationsByOrder } from "@/db/queries/reservations";
import { orders, products } from "@/db/schema";
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

  // Atomic conditional claim: only the first concurrent caller gets rows back.
  // Mark the payment as paid first, but do not confirm fulfilment until the
  // reserved one-of-one products are successfully moved to sold.
  const rows = await db
    .update(orders)
    .set({
      paidAt,
      paymentId: input.paymentId,
      paymentMethod: input.paymentMethod ?? "razorpay",
      paymentStatus: "paid",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, input.orderId),
        ne(orders.paymentStatus, "paid"),
        or(isNull(orders.paymentId), eq(orders.paymentId, input.paymentId))
      )
    )
    .returning({ id: orders.id });

  if (rows.length === 0) {
    // Loser path: another call already completed this order.
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
      order: current ?? existing,
    };
  }

  // Winner path: this call owns completion — update stock, confirm the order,
  // emit event, and send emails.
  const productIds = existing.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  if (productIds.length > 0) {
    const soldRows = await db
      .update(products)
      .set({
        reservedUntil: null,
        soldAt: new Date(),
        stockStatus: "sold",
        // Dual-write: quantity_available set to 0 on sale (v2 state mirrors stockStatus)
        quantityAvailable: 0,
        updatedAt: new Date(),
      })
      .where(and(inArray(products.id, productIds), eq(products.stockStatus, "reserved")))
      .returning({ slug: products.slug });
    const soldProducts = soldRows ?? [];
    if (soldProducts.length !== productIds.length) {
      await addOrderEvent(input.orderId, "Payment completion inventory conflict", existing.status ?? "pending", {
        code: "PRODUCT_SOLD",
        requestedProductIds: productIds,
        soldCount: soldProducts.length,
      });
      throw new Error("PRODUCT_SOLD");
    }

    revalidateProductsCache(soldProducts.map((product) => product.slug));

    // Dual-write: release reservation rows now that the order is paid
    await releaseReservationsByOrder(input.orderId);
  }

  await db
    .update(orders)
    .set({
      status: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, input.orderId));

  await addOrderEvent(input.orderId, `${input.source} payment confirmed`, "confirmed", {
    paymentId: input.paymentId,
    paymentReference: input.paymentReference ?? null,
  });

  // P6-02: Increment discount usageCount atomically now that payment is confirmed.
  // Uses conditional UPDATE: SET usage_count = usage_count + 1 WHERE usage_count < usage_limit
  // (or usage_limit IS NULL). The conditional guard closes the stale-read over-redemption
  // window: if the code was exhausted between create-order and payment confirmation,
  // incrementDiscountUsage returns false and we log an order event for review.
  // Only the winner branch reaches here (rows.length > 0 guard above), so this
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
