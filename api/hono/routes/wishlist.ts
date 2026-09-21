/**
 * P6-04: Wishlist routes — auth-scoped, analytics-emitting.
 *
 * GET  /           list product IDs for authed user
 * POST /           add to wishlist (idempotent)
 * DELETE /         remove from wishlist
 * POST /notify     register an availability email only while another shopper holds the piece
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
  expireCommerceHoldsForProducts,
  getViewerStateRows,
} from "@/db/queries/user-cart";
import { getUserById } from "@/db/queries/users";
import {
  addToWishlist,
  listWishlistProductIds,
  mergeGuestWishlist,
  removeFromWishlist,
  upsertRestockNotifyRequest,
} from "@/db/queries/wishlist";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { consentFromRequest } from "@/lib/analytics/server-consent";
import {
  resolveViewerState,
  type ViewerProductState,
} from "@/lib/commerce/viewer-state";

const MAX_WISHLIST_MERGE_ITEMS = 100;

const VIEWER_PRODUCT_STATES = [
  "available",
  "in_my_cart",
  "payment_pending",
  "reserved_by_other",
  "sold",
] as const satisfies readonly ViewerProductState[];

/*
 * A refused Notify Me answers with the shopper's current verdict, so the
 * control they clicked can settle on the right state instead of a generic
 * "try again". Only reserved_by_other offers Notify Me; if the verdict still
 * says so, the hold changed between the atomic write and this read.
 */
const NOTIFY_REFUSALS: Record<
  ViewerProductState,
  {
    code:
      | "NOTIFY_NOT_ELIGIBLE"
      | "NOTIFY_OWN_HOLD"
      | "PRODUCT_AVAILABLE"
      | "PRODUCT_SOLD";
    message: string;
  }
> = {
  available: {
    code: "PRODUCT_AVAILABLE",
    message: "This piece is available now.",
  },
  in_my_cart: {
    code: "NOTIFY_OWN_HOLD",
    message: "This piece is already in your bag.",
  },
  payment_pending: {
    code: "NOTIFY_OWN_HOLD",
    message: "This piece is already in your bag.",
  },
  reserved_by_other: {
    code: "NOTIFY_NOT_ELIGIBLE",
    message: "Notify Me is not available for this piece right now.",
  },
  sold: {
    code: "PRODUCT_SOLD",
    message: "This saree has found its next home.",
  },
};

const notifyRefusalSchema = errorSchema.extend({
  reservedUntil: z.string().nullable(),
  viewerState: z.enum(VIEWER_PRODUCT_STATES),
});

const wishlistMutationSchema = z.object({
  productId: z.string().uuid(),
});

/*
 * Product only. The address comes from the verified account, never the
 * browser: a body-supplied email would let anyone subscribe a stranger to
 * mail about a saree they never looked at.
 */
const wishlistNotifySchema = z.object({
  productId: z.string().uuid(),
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
        409: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Sold products cannot be newly saved",
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
        .select({
          id: products.id,
          name: products.name,
          stockStatus: products.stockStatus,
        })
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

      if (existingProduct.stockStatus === "sold") {
        return c.json(
          {
            code: "PRODUCT_SOLD",
            message: "This saree has found its next home.",
          },
          409,
        );
      }

      /*
       * The query repeats the sold check while holding the product row. This
       * closes the gap between the display lookup above and payment completion
       * without changing idempotent repeat saves.
       */
      const saved = await addToWishlist(authUserOrResponse.id, body.productId);
      if (!saved) {
        return c.json(
          {
            code: "PRODUCT_SOLD",
            message: "This saree has found its next home.",
          },
          409,
        );
      }

      // Fire-and-forget demand signal — MUST NOT block or fail the action.
      void emitAnalyticsEvent({
        consent: consentFromRequest(c.req.raw),
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
        consent: consentFromRequest(c.req.raw),
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
        409: {
          content: {
            "application/json": { schema: notifyRefusalSchema },
          },
          description:
            "Notify Me refused; carries the viewer's current verdict",
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

      /*
       * Authenticated only. Commerce is authenticated-first, so the shopper
       * has already signed in through the commerce popup by the time this
       * runs, and their verified address is the one we mail.
       */
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;
      const body = c.req.valid("json");

      /*
       * The address is the account's current one, read from the database. A
       * verified email change does not refresh the session token, so the
       * token's copy can name an address the account no longer has.
       */
      const account = await getUserById(authUserOrResponse.id);
      if (!account?.email) {
        return c.json(
          {
            code: "EMAIL_REQUIRED",
            message: "Your account has no email address to notify.",
          },
          400
        );
      }

      /*
       * The database both verifies that another shopper holds this published
       * piece and persists the intent in one INSERT ... SELECT. A separate
       * read followed by an UPSERT could register a notification after the
       * product had already become available or sold.
       */
      const registered = await upsertRestockNotifyRequest(
        body.productId,
        account.email,
        authUserOrResponse.id
      );

      if (!registered) {
        const [existingProduct] = await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, body.productId),
              eq(products.status, "published"),
            ),
          )
          .limit(1);

        if (!existingProduct) {
          return c.json(
            {
              code: "PRODUCT_NOT_FOUND",
              message: "Product not found.",
            },
            404,
          );
        }

        /*
         * Classify the refusal with the verdict POST /products/viewer-state
         * serves, so the answer cannot contradict the control the shopper
         * clicked: sweep lapsed ordinary holds first, then decide from this
         * account's rows. The sweep's payment protection is the only thing
         * layered onto a row.
         */
        const now = new Date();
        const expiry = await expireCommerceHoldsForProducts(
          [body.productId],
          now,
        );
        const [viewerRow] = await getViewerStateRows(
          [body.productId],
          authUserOrResponse.id,
        );
        if (!viewerRow) {
          return c.json(
            {
              code: "PRODUCT_NOT_FOUND",
              message: "Product not found.",
            },
            404,
          );
        }

        const verdict = resolveViewerState(
          {
            ...viewerRow,
            paymentProtected: expiry.blockedProductIds.includes(body.productId),
          },
          now,
        );
        const refusal = NOTIFY_REFUSALS[verdict.state];

        return c.json(
          {
            code: refusal.code,
            message: refusal.message,
            reservedUntil: verdict.reservedUntil,
            viewerState: verdict.state,
          },
          409,
        );
      }

      // Fire-and-forget demand signal.
      // NOTE: raw email is intentionally OMITTED from the payload.
      // It is captured durably in restock_notify_requests (the correct PII system of record).
      // Spreading email here would ship plaintext PII to GA4 and Meta CAPI via fan-out.
      void emitAnalyticsEvent({
        consent: consentFromRequest(c.req.raw),
        event_id: crypto.randomUUID(),
        type: "restock_notify_requested",
        payload: {
          productId: body.productId,
          userId: authUserOrResponse.id,
          stockStatus: "reserved",
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

	      /*
	       * Merge what survives; drop what does not.
	       *
	       * Rejecting the whole batch meant one hard-deleted saree cost a guest
	       * their entire trunk: the client only clears the guest store on a 200,
	       * so every later page load re-sent the same doomed array and their
	       * saves never reached the account. A dead id is invisible anyway — the
	       * wishlist page already drops ids that resolve to no product.
	       */
	      const mergedProductIds = await mergeGuestWishlist(
	        authUserOrResponse.id,
	        productIds,
	      );

	      return c.json(
	        {
	          success: true,
	          merged: mergedProductIds.length,
	          dropped: productIds.length - mergedProductIds.length,
	        },
	        200
	      );
	    }
  );
};
