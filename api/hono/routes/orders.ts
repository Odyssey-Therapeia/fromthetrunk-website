import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray, sql } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { getOrder, listOrderSummaries } from "@/db/queries/orders";
import { products, userCartItems } from "@/db/schema";
import { verifyReservationToken } from "@/lib/cart/reservation-token";

/*
 * The exact current payment hold on a product: a pending order's reservation
 * at the product's current expiry, with that order owner's bag row still
 * payment_pending at the same instant. There is no local-clock bound, so an
 * unreconciled link stays protected until provider-aware reconciliation. A
 * historical pending order that misses any condition protects nothing.
 */
const exactPaymentHoldExists = (ownerId?: string) => sql<boolean>`exists (
  select 1
  from reservations as hold_reservation
  join orders as hold_order
    on hold_order.id = hold_reservation.order_id
   and hold_order.payment_status = 'pending'
  join user_cart_items as hold_cart
    on hold_cart.user_id = hold_order.user_id
   and hold_cart.product_id = hold_reservation.product_id
   and hold_cart.status = 'payment_pending'
   and hold_cart.reserved_until = hold_reservation.expires_at
  where hold_reservation.product_id = ${products.id}
    and hold_reservation.expires_at = ${products.reservedUntil}
    and ${products.stockStatus} = 'reserved'
    ${ownerId ? sql`and hold_order.user_id = ${ownerId}` : sql``}
)`;

type ReorderProductRow = {
  cartReservationToken: null | string;
  cartReservedUntil: Date | null;
  cartStatus: null | string;
  id: string;
  ownPaymentHold: boolean;
  paymentProtected: boolean;
  reservedUntil: Date | null;
  stockStatus: string;
};

/**
 * The requester already holds this piece: either their exact open payment, or
 * a live bag hold whose signed token proves the product's current expiry. A
 * bare bag row proves neither.
 */
const requesterHoldsPiece = (row: ReorderProductRow, now: Date) => {
  if (
    row.stockStatus !== "reserved" ||
    row.reservedUntil == null ||
    row.cartReservedUntil?.getTime() !== row.reservedUntil.getTime()
  ) {
    return false;
  }
  if (row.cartStatus === "payment_pending") return Boolean(row.ownPaymentHold);
  if (row.cartStatus !== "active" || row.reservedUntil <= now) return false;
  const token = verifyReservationToken(row.cartReservationToken);
  return (
    token?.productId === row.id &&
    token.reservedUntil.getTime() === row.reservedUntil.getTime()
  );
};

/** Buyable by anyone: free stock, or a lapsed hold no exact payment protects. */
const pieceIsFree = (row: ReorderProductRow, now: Date) =>
  row.stockStatus === "available" ||
  (row.stockStatus === "reserved" &&
    row.reservedUntil != null &&
    row.reservedUntil <= now &&
    !row.paymentProtected);

export const registerOrderRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Orders list" },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const status = c.req.query("status");
      const rawLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
      const rawOffset = Number.parseInt(c.req.query("offset") ?? "", 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 100)
        : 50;
      const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
      const isAdmin = authUserOrResponse.role === "admin";
      const orders = await listOrderSummaries({
        limit,
        offset,
        status:
          status === "confirmed" ||
          status === "delivered" ||
          status === "pending" ||
          status === "shipped"
            ? status
            : undefined,
        userId: isAdmin ? undefined : authUserOrResponse.id,
        // P6-01: also surface guest orders by the user's verified email so
        // pre-claim checkout history appears in the account orders tab.
        userEmail:
          isAdmin || !authUserOrResponse.email
            ? undefined
            : authUserOrResponse.email,
      });

      return c.json(orders, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Order detail" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { id } = c.req.valid("param");
      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      // Allow access when:
      //   (a) admin bypass, OR
      //   (b) the order belongs to the authenticated user (userId match), OR
      //   (c) guest order (userId null) whose shippingEmail matches the
      //       session user's verified email — mirrors the list-route visibility
      //       rule added in P6-01 so guest orders surfaced in the orders list
      //       are also openable on the detail route.
      const isAdmin = authUserOrResponse.role === "admin";
      const isOwner = order.userId === authUserOrResponse.id;
      const sessionEmail = authUserOrResponse.email ?? null;
      const isEmailClaim =
        order.userId === null &&
        order.shippingEmail !== null &&
        sessionEmail !== null &&
        order.shippingEmail.toLowerCase() === sessionEmail.toLowerCase();

      if (!isAdmin && !isOwner && !isEmailClaim) {
        return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
      }

      return c.json(order, 200);
    }
  );

  // Reorder preview: for a FAILED order, report which of its one-of-one pieces
  // are still buyable right now (available, or a reservation whose hold lapsed),
  // plus the data the cart needs. Claiming is left to the authenticated
  // POST /api/v2/cart/items command so reservation logic stays in one place.
  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/reorder-preview",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Reorder availability" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { id } = c.req.valid("param");
      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      const isAdmin = authUserOrResponse.role === "admin";
      const isOwner = order.userId === authUserOrResponse.id;
      const sessionEmail = authUserOrResponse.email ?? null;
      const isEmailClaim =
        order.userId === null &&
        order.shippingEmail !== null &&
        sessionEmail !== null &&
        order.shippingEmail.toLowerCase() === sessionEmail.toLowerCase();
      if (!isAdmin && !isOwner && !isEmailClaim) {
        return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
      }

      const productIds = order.items
        .map((item) => item.productId)
        .filter((pid): pid is string => Boolean(pid));

      const requesterId = authUserOrResponse.id;
      const productRows = productIds.length
        ? await db
            .select({
              id: products.id,
              pricePaise: products.pricePaise,
              originalPricePaise: products.originalPricePaise,
              slug: products.slug,
              stockStatus: products.stockStatus,
              reservedUntil: products.reservedUntil,
              cartReservationToken: userCartItems.reservationToken,
              cartReservedUntil: userCartItems.reservedUntil,
              cartStatus: userCartItems.status,
              ownPaymentHold: exactPaymentHoldExists(requesterId),
              paymentProtected: exactPaymentHoldExists(),
            })
            .from(products)
            .leftJoin(
              userCartItems,
              and(
                eq(userCartItems.productId, products.id),
                eq(userCartItems.userId, requesterId),
                inArray(userCartItems.status, ["active", "payment_pending"]),
              ),
            )
            .where(inArray(products.id, productIds))
        : [];
      const byId = new Map(productRows.map((row) => [row.id, row]));
      const now = new Date();

      const items = order.items.map((item) => {
        const product = item.productId ? byId.get(item.productId) : undefined;
        const hasSlug = Boolean(product?.slug);
        // The requester's own hold is reported, not re-offered: adding it
        // again would read as a claim on a piece that is already theirs.
        const inBag = Boolean(product) && hasSlug && requesterHoldsPiece(product!, now);
        return {
          productId: item.productId,
          slug: product?.slug ?? null,
          name: item.name,
          // Reordering re-buys the piece at TODAY's catalogue price: checkout
          // re-prices server-side from products.price_paise
          // (api/hono/routes/payments.ts), so the bag must not show the frozen
          // order-item price. Both halves of the savings pair come from the same
          // current row — mixing the historic charged price with the current
          // list price overstates the saving and disagrees with what is charged.
          // The order-item price stays the fallback for a product row that no
          // longer exists, which `available` already gates off.
          pricePaise: product?.pricePaise ?? item.pricePaise,
          // Optional and never invented: absent stays null so the cart renders
          // no savings rather than a fabricated one.
          originalPricePaise: product?.originalPricePaise ?? null,
          image: item.imageUrl ?? null,
          selectedOptions: item.selectedOptions ?? {},
          // Only offer pieces we can actually add to the cart (still buyable + have a slug).
          available:
            Boolean(product) && hasSlug && !inBag && pieceIsFree(product!, now),
          inBag,
        };
      });

      return c.json({ items }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      responses: {
        405: {
          content: { "application/json": { schema: errorSchema } },
          description: "Direct order creation disabled",
        },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      return c.json(
        {
          code: "ORDER_CREATION_DISABLED",
          message:
            "Direct order creation is disabled. Start checkout through the payments endpoint.",
        },
        405
      );
    }
  );
};
