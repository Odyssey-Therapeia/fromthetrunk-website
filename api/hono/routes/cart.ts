import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { cartReservationSchema } from "@/api/hono/schemas/cart";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products } from "@/db/schema";
import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { verifyBearerSecret } from "@/lib/http/verify-secret";

const RESERVATION_MINUTES = 30;

export const registerCartRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/reserve",
      request: {
        body: {
          content: {
            "application/json": {
              schema: cartReservationSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Reserved item",
        },
        404: {
          content: {
            "application/json": {
              schema: errorSchema,
            },
          },
          description: "Product not found",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "cart:reserve", {
        limit: 10,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const { productId } = c.req.valid("json");
      const now = new Date();
      const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
      let signedReservationToken: string;
      try {
        signedReservationToken = createReservationToken({
          productId,
          reservedUntil,
        });
      } catch {
        return c.json(
          {
            code: "RESERVATION_TOKEN_SECRET_MISSING",
            message: "Reservation token signing is not configured.",
          },
          500
        );
      }

      const [reserved] = await db
        .update(products)
        .set({
          reservedUntil,
          stockStatus: "reserved",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, productId),
            or(
              eq(products.stockStatus, "available"),
              and(
                eq(products.stockStatus, "reserved"),
                isNotNull(products.reservedUntil),
                lt(products.reservedUntil, now)
              )
            )
          )
        )
        .returning({ id: products.id, slug: products.slug });

      if (!reserved) {
        const [product] = await db
          .select({
            id: products.id,
            reservedUntil: products.reservedUntil,
            stockStatus: products.stockStatus,
          })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!product) {
          return c.json(
            {
              code: "PRODUCT_NOT_FOUND",
              message: "Product not found.",
            },
            404
          );
        }

        if (product.stockStatus === "sold") {
          return c.json(
            {
              code: "ITEM_SOLD",
              message: "This item has been sold.",
            },
            409
          );
        }

        return c.json(
          {
            code: "ITEM_RESERVED",
            message: "This item is reserved by another buyer.",
          },
          409
        );
      }

      revalidateProductsCache([reserved.slug]);

      return c.json(
        {
          productId,
          reserved: true,
          reservationToken: signedReservationToken,
          reservedUntil: reservedUntil.toISOString(),
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/release",
      request: {
        body: {
          content: {
            "application/json": {
              schema: cartReservationSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Released item",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "cart:release", {
        limit: 20,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const { productId, reservationToken } = c.req.valid("json");
      const [product] = await db
        .select({
          id: products.id,
          reservedUntil: products.reservedUntil,
          slug: products.slug,
          stockStatus: products.stockStatus,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      const now = new Date();
      const isActiveReservation =
        product.stockStatus === "reserved" &&
        (!product.reservedUntil || product.reservedUntil > now);
      let activeReservationUntil: Date | null = null;

      if (isActiveReservation) {
        const verifiedToken = verifyReservationToken(reservationToken);
        const hasMatchingReservationToken =
          verifiedToken != null &&
          verifiedToken.productId === productId &&
          verifiedToken.reservedUntil > now &&
          product.reservedUntil != null &&
          Math.abs(product.reservedUntil.getTime() - verifiedToken.reservedUntil.getTime()) <
            1000;

        if (!hasMatchingReservationToken) {
          return c.json(
            {
              code: "RESERVATION_OWNER_REQUIRED",
              message:
                "Active reservation release requires the matching reservation token.",
            },
            409
          );
        }
        activeReservationUntil = verifiedToken.reservedUntil;
      }

      const isExpiredReservation =
        product.stockStatus === "reserved" &&
        product.reservedUntil != null &&
        product.reservedUntil <= now;

      if (!isActiveReservation && !isExpiredReservation) {
        return c.json(
          {
            code: "RESERVATION_NOT_ACTIVE",
            message: "This item does not have a releasable reservation.",
          },
          409
        );
      }

      const releasePredicate = isActiveReservation
        ? and(
            eq(products.id, productId),
            eq(products.stockStatus, "reserved"),
            eq(products.reservedUntil, activeReservationUntil!),
          )
        : and(
            eq(products.id, productId),
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, now),
          );

      const [released] = await db
        .update(products)
        .set({
          quantityAvailable: 1,
          reservedUntil: null,
          stockStatus: "available",
          updatedAt: new Date(),
        })
        .where(releasePredicate)
        .returning({ id: products.id, slug: products.slug });

      if (!released) {
        return c.json(
          {
            code: "RESERVATION_NOT_ACTIVE",
            message: "This item does not have an expired reservation to release.",
          },
          409
        );
      }

      revalidateProductsCache([released.slug]);

      return c.json({ productId, released: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/release-expired",
      responses: {
        200: {
          description: "Released expired reservations",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = c.req.header("authorization") ?? null;
      const cronAuthorized = cronSecret
        ? verifyBearerSecret(authHeader, cronSecret)
        : false;
      if (!cronAuthorized) {
        const adminOrResponse = requireAdmin(c);
        if (adminOrResponse instanceof Response) return adminOrResponse;
      }

      const rateLimited = await rateLimitResponse(c.req.raw, "cart:release-expired", {
        limit: 5,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const expiredRows = await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(
          and(
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, new Date())
          )
        );

      const expiredIds = expiredRows.map((row) => row.id);
      if (expiredIds.length > 0) {
        await db
          .update(products)
          .set({
            quantityAvailable: 1,
            reservedUntil: null,
            stockStatus: "available",
            updatedAt: new Date(),
          })
          .where(inArray(products.id, expiredIds));

        revalidateProductsCache(expiredRows.map((row) => row.slug));
      }

      return c.json(
        {
          released: expiredIds.length,
        },
        200
      );
    }
  );
};
