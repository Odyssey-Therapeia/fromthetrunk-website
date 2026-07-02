import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { getOrder, listOrderSummaries } from "@/db/queries/orders";
import { products } from "@/db/schema";

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
  // plus the data the cart needs. Reserving is left to the existing
  // /api/v2/cart/reserve endpoint so reservation logic stays in one place.
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

      const productRows = productIds.length
        ? await db
            .select({
              id: products.id,
              slug: products.slug,
              stockStatus: products.stockStatus,
              reservedUntil: products.reservedUntil,
            })
            .from(products)
            .where(inArray(products.id, productIds))
        : [];
      const byId = new Map(productRows.map((row) => [row.id, row]));
      const now = Date.now();

      const items = order.items.map((item) => {
        const product = item.productId ? byId.get(item.productId) : undefined;
        const stockFree =
          product?.stockStatus === "available" ||
          (product?.stockStatus === "reserved" &&
            product.reservedUntil !== null &&
            product.reservedUntil.getTime() < now);
        return {
          productId: item.productId,
          slug: product?.slug ?? null,
          name: item.name,
          pricePaise: item.pricePaise,
          image: item.imageUrl ?? null,
          selectedOptions: item.selectedOptions ?? {},
          // Only offer pieces we can actually add to the cart (still buyable + have a slug).
          available: Boolean(product?.slug) && Boolean(stockFree),
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
