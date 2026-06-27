/**
 * P6-04: Wishlist routes — auth-scoped, analytics-emitting.
 *
 * GET  /           list product IDs for authed user
 * POST /           add to wishlist (idempotent)
 * DELETE /         remove from wishlist
 * POST /notify     capture restock intent for sold/reserved items
 *
 * All mutations emit fire-and-forget analytics events (P2-07).
 * A throwing sink MUST NOT fail the action (caught + logged per emitAnalyticsEvent contract).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products, wishlistItems } from "@/db/schema";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import {
  addToWishlist,
  listWishlistProductIds,
  mergeGuestWishlist,
  removeFromWishlist,
  upsertRestockNotifyRequest,
} from "@/db/queries/wishlist";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";

const MAX_WISHLIST_MERGE_ITEMS = 100;

const wishlistMutationSchema = z.object({
  productId: z.string().uuid(),
});

const wishlistNotifySchema = z.object({
  productId: z.string().uuid(),
  email: z.string().trim().email().max(320),
});

const wishlistMergeSchema = z.object({
  productIds: z.array(z.string().uuid()).max(MAX_WISHLIST_MERGE_ITEMS),
});

export const registerWishlistRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // ── GET / ─────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Wishlist product IDs" },
      },
      tags: ["Wishlist"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const productIds = await listWishlistProductIds(authUserOrResponse.id);
      return c.json(productIds, 200);
    }
  );

  // ── POST / ────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistMutationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Wishlist item added" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Product not found",
        },
      },
      tags: ["Wishlist"],
    }),
	    async (c) => {
	      const authUserOrResponse = requireAuth(c);
	      if (authUserOrResponse instanceof Response) return authUserOrResponse;

	      const rateLimited = await rateLimitResponse(
	        c.req.raw,
	        `wishlist:add:${authUserOrResponse.id}`,
	        {
	          limit: 60,
	          requireDurable: true,
	          windowSeconds: 60,
	        }
	      );
	      if (rateLimited) return rateLimited;

	      const body = c.req.valid("json");

      const [existingProduct] = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(
          and(
            eq(products.id, body.productId),
            inArray(products.status, ["draft", "published"])
          )
        )
        .limit(1);
      if (!existingProduct) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      await addToWishlist(authUserOrResponse.id, body.productId);

      // Fire-and-forget demand signal — MUST NOT block or fail the action.
      void emitAnalyticsEvent({
        event_id: crypto.randomUUID(),
        type: "wishlist_added",
        payload: {
          userId: authUserOrResponse.id,
          productId: body.productId,
          productName: existingProduct.name,
        },
        occurredAt: new Date(),
      });

      return c.json({ success: true }, 200);
    }
  );

  // ── DELETE / ──────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "delete",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistMutationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Wishlist item removed" },
      },
      tags: ["Wishlist"],
    }),
	    async (c) => {
	      const authUserOrResponse = requireAuth(c);
	      if (authUserOrResponse instanceof Response) return authUserOrResponse;

	      const rateLimited = await rateLimitResponse(
	        c.req.raw,
	        `wishlist:delete:${authUserOrResponse.id}`,
	        {
	          limit: 60,
	          requireDurable: true,
	          windowSeconds: 60,
	        }
	      );
	      if (rateLimited) return rateLimited;

	      const body = c.req.valid("json");

      await removeFromWishlist(authUserOrResponse.id, body.productId);

      // Fire-and-forget demand signal — MUST NOT block or fail the action.
      void emitAnalyticsEvent({
        event_id: crypto.randomUUID(),
        type: "wishlist_removed",
        payload: {
          userId: authUserOrResponse.id,
          productId: body.productId,
        },
        occurredAt: new Date(),
      });

      return c.json({ success: true }, 200);
    }
  );

  // ── POST /notify ──────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/notify",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistNotifySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Restock notify intent captured" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Product not found",
        },
        429: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Too many requests",
        },
      },
      tags: ["Wishlist"],
    }),
    async (c) => {
      // Rate-limit unauthenticated mutations to prevent DB + analytics fan-out flooding.
      // Mirrors newsletter.ts:32-36 — 3 requests per 60 s per IP.
      const rateLimited = await rateLimitResponse(c.req.raw, "restock:notify", {
        limit: 3,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      // Auth is optional for notify — guests can register by email.
      const authUser = c.get("authUser");
      const body = c.req.valid("json");

      const [existingProduct] = await db
        .select({ id: products.id, stockStatus: products.stockStatus })
        .from(products)
        .where(
          and(
            eq(products.id, body.productId),
            inArray(products.status, ["draft", "published"])
          )
        )
        .limit(1);
      if (!existingProduct) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      // Persist the intent (durable, de-duped by composite PK).
      await upsertRestockNotifyRequest(
        body.productId,
        body.email,
        authUser?.id ?? undefined
      );

      // Fire-and-forget demand signal.
      // NOTE: raw email is intentionally OMITTED from the payload.
      // It is captured durably in restock_notify_requests (the correct PII system of record).
      // Spreading email here would ship plaintext PII to GA4 and Meta CAPI via fan-out.
      void emitAnalyticsEvent({
        event_id: crypto.randomUUID(),
        type: "restock_notify_requested",
        payload: {
          productId: body.productId,
          userId: authUser?.id ?? null,
          stockStatus: existingProduct.stockStatus,
        },
        occurredAt: new Date(),
      });

      return c.json({ success: true }, 200);
    }
  );

  // ── POST /merge ───────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/merge",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistMergeSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Guest wishlist merged into account" },
      },
      tags: ["Wishlist"],
    }),
	    async (c) => {
	      const authUserOrResponse = requireAuth(c);
	      if (authUserOrResponse instanceof Response) return authUserOrResponse;

	      const rateLimited = await rateLimitResponse(
	        c.req.raw,
	        `wishlist:merge:${authUserOrResponse.id}`,
	        {
	          limit: 10,
	          requireDurable: true,
	          windowSeconds: 5 * 60,
	        }
	      );
	      if (rateLimited) return rateLimited;

	      const body = c.req.valid("json");
	      const productIds = Array.from(new Set(body.productIds));
	      if (productIds.length === 0) return c.json({ success: true }, 200);

	      const existingProducts = await db
	        .select({ id: products.id })
	        .from(products)
	        .where(
	          and(
	            inArray(products.id, productIds),
	            inArray(products.status, ["draft", "published"])
	          )
	        );
	      if (existingProducts.length !== productIds.length) {
	        return c.json(
	          {
	            code: "INVALID_PRODUCT_IDS",
	            message: "One or more products are unavailable.",
	          },
	          400
	        );
	      }

	      await mergeGuestWishlist(authUserOrResponse.id, productIds);
	      return c.json({ success: true }, 200);
	    }
  );
};
