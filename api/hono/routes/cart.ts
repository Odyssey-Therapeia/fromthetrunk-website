import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import { requireAdmin, requireAuth } from "@/api/hono/middleware/auth";
import {
  cartItemParamSchema,
  cartItemSchema,
  cartReservationSchema,
} from "@/api/hono/schemas/cart";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { getBlouseProductIdSet } from "@/db/queries/products";
import {
  claimProductIntoCart,
  expireCommerceHoldsForProducts,
  getUserCartItem,
  getViewerStateRows,
  listLapsedOwnPaymentOrderIds,
  listUserCartItems,
  listUserCartLines,
  pruneUnownedCartRows,
  releaseCartHoldByToken,
  removeOwnedCartItem,
  upsertUnreservedCartItem,
} from "@/db/queries/user-cart";
import { products } from "@/db/schema";
import { getCartReservationExpiresAt } from "@/lib/cart/reservation-policy";
import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";
import {
  logCartRemoveServer,
  newCartRequestId,
} from "@/lib/commerce/cart-debug";
import {
  resolveViewerState,
  resolveViewerStates,
  type ViewerProductState,
} from "@/lib/commerce/viewer-state";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { createLogger } from "@/lib/log";

const log = createLogger("cart:items");

type CartLine = Awaited<ReturnType<typeof listUserCartLines>>[number];

const toCartResponseItem = (
  line: CartLine,
  viewerState?: ViewerProductState | null,
) => ({
  addedAt: line.addedAt.toISOString(),
  detailsFabric: line.detailsFabric,
  imageAlt: line.imageAlt,
  imageUrl: line.imageUrl,
  name: line.name,
  originalPricePaise: line.originalPricePaise,
  pricePaise: line.pricePaise,
  productId: line.productId,
  reservedUntil: line.reservedUntil?.toISOString() ?? null,
  selectedOptions: line.selectedOptions,
  slug: line.slug,
  status: line.status,
  ...(viewerState ? { viewerState } : {}),
});

/**
 * The verdict POST /api/v2/products/viewer-state would give this shopper for
 * this saree right now.
 *
 * Every cart answer carries it, so a mutation can never tell one surface
 * something the next poll contradicts. `paymentProtected` comes from the
 * request's own sweep. Null when the product is not a published piece: there
 * is no verdict to give, and inventing one would be a guess.
 */
const readViewerVerdict = async ({
  now,
  paymentProtected,
  productId,
  userId,
}: {
  now: Date;
  paymentProtected: boolean;
  productId: string;
  userId: string;
}): Promise<ViewerProductState | null> => {
  const [row] = await getViewerStateRows([productId], userId);
  return row
    ? resolveViewerState({ ...row, paymentProtected }, now).state
    : null;
};

/**
 * Settle this shopper's own lapsed payment holds with the provider before a
 * bag answer is built.
 *
 * A link that outlived its hold keeps the line In bag with no trash until
 * something asks Razorpay what became of it. Asking on the shopper's own
 * request hands back the remaining cart time, releases the piece or completes
 * a capture without waiting for the scheduled run. At most three orders are
 * asked about, and a failure leaves the hold protected for the cron: the
 * request carries on and reads whatever state is left. The products
 * viewer-state poll never comes through here, so polling never calls Razorpay.
 */
const reconcileLapsedOwnPayments = async ({
  now,
  productIds,
  userId,
}: {
  now: Date;
  productIds: string[];
  userId: string;
}): Promise<void> => {
  if (productIds.length === 0) return;

  let orderIds: string[];
  try {
    orderIds = await listLapsedOwnPaymentOrderIds({ now, productIds, userId });
  } catch (error) {
    log.warn("Lapsed payment holds could not be listed; they stay protected", {
      error,
      userId,
    });
    return;
  }

  for (const orderId of orderIds) {
    try {
      // Imported lazily: the provider client and order completion load only
      // once a stalled payment has actually been found.
      const { reconcilePaymentHoldForOrder } = await import(
        "@/lib/payments/reconcile-expired-holds"
      );
      const reconciliation = await reconcilePaymentHoldForOrder({ now, orderId });
      if (reconciliation.kind === "released") {
        const slugs = [
          ...reconciliation.releasedSlugs,
          ...reconciliation.restoredSlugs,
        ];
        if (slugs.length > 0) revalidateProductsCache(slugs);
      }
    } catch (error) {
      log.warn("Inline payment hold reconciliation failed; it stays protected", {
        error,
        orderId,
      });
    }
  }
};

export const registerCartRoutes = (app: OpenAPIHono<HonoBindings>) => {
  /*
   * The signed-in shopper's bag, from the server.
   *
   * This is what makes a bag survive a refresh, a new tab, or a different
   * device: the rows live against the account, so localStorage is no longer
   * where ownership is decided.
   */
  app.openapi(
    createRoute({
      method: "get",
      path: "/items",
      responses: {
        200: { description: "The authenticated shopper's bag" },
        401: { description: "Authentication required" },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      /*
       * Per-account and never shareable. Without this a proxy, a browser back
       * step or a service worker can hand one shopper's bag to the next
       * request on the same connection.
       */
      c.header("Cache-Control", "private, no-store");

      const userId = authUserOrResponse.id;
      const now = new Date();
      const items = await listUserCartItems(userId);
      if (items.length === 0) return c.json({ items: [] }, 200);

      // A line in payment whose link outlived its hold is settled first, so
      // everything below reads what that payment actually became.
      await reconcileLapsedOwnPayments({
        now,
        productIds: items
          .filter((item) => item.status === "payment_pending")
          .map((item) => item.productId),
        userId,
      });

      /*
       * Sweep this shopper's own pieces before answering. A hold that lapsed
       * while every tab was closed must not still read as theirs, and nothing
       * here may wait for a scheduled job.
       */
      const expiry = await expireCommerceHoldsForProducts(
        items.map((item) => item.productId),
        now,
      );

      /*
       * Then drop the lines that own nothing, so the drawer never shows one
       * the shopper has no action on. A line in payment and a hold-free
       * made-to-order line of a buyable piece always stay.
       */
      await pruneUnownedCartRows({ now, userId });
      const lines = await listUserCartLines(userId);

      /*
       * Each line carries the same verdict the cards read. A row existing is
       * not ownership, so the drawer's trash must follow this answer rather
       * than the row's own status.
       */
      const paymentProtectedIds = new Set(expiry.blockedProductIds);
      const viewerRows = await getViewerStateRows(
        lines.map((line) => line.productId),
        userId,
      );
      const verdicts = resolveViewerStates(
        viewerRows.map((row) => ({
          ...row,
          paymentProtected: paymentProtectedIds.has(row.productId),
        })),
        now,
      );

      return c.json(
        {
          items: lines.map((line) =>
            toCartResponseItem(line, verdicts[line.productId]?.state),
          ),
        },
        200
      );
    }
  );

  /*
   * Put a saree in the signed-in shopper's bag.
   *
   * The customer comes from the session, never the body: a userId a browser
   * could send would let anyone fill anyone's bag.
   */
  app.openapi(
    createRoute({
      method: "post",
      path: "/items",
      request: {
        body: {
          content: { "application/json": { schema: cartItemSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Item saved to the authenticated bag" },
        401: { description: "Authentication required" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product unavailable",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const rateLimited = await rateLimitResponse(c.req.raw, "cart:items:add", {
        limit: 20,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      c.header("Cache-Control", "private, no-store");

      const { productId, selectedOptions } = c.req.valid("json");
      const userId = authUserOrResponse.id;
      const now = new Date();
      const readSavedItem = async (viewerState: ViewerProductState) => {
        const line = (await listUserCartLines(userId)).find(
          (candidate) => candidate.productId === productId,
        );
        if (!line) throw new Error("CART_ITEM_WRITE_NOT_VISIBLE");
        return toCartResponseItem(line, viewerState);
      };

      // Correctness never waits for a scheduled sweep: a hold that lapsed
      // while every tab was closed is freed here, on the way in.
      const expiry = await expireCommerceHoldsForProducts([productId], now);
      const paymentProtected = expiry.blockedProductIds.includes(productId);
      const readViewerState = () =>
        readViewerVerdict({ now, paymentProtected, productId, userId });

      const [product] = await db
        .select({
          id: products.id,
          status: products.status,
          stockStatus: products.stockStatus,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product || product.status !== "published") {
        return c.json(
          { code: "PRODUCT_NOT_FOUND", message: "Product not found." },
          404
        );
      }

      /*
       * A lapsed payment link still protects its piece until the provider
       * says otherwise, and nobody gets a new hold on it meanwhile. Its own
       * shopper hears their payment is in progress; anyone else hears it is
       * reserved.
       */
      if (paymentProtected) {
        const viewerState = await readViewerState();
        return c.json(
          viewerState === "payment_pending"
            ? {
                code: "PAYMENT_IN_PROGRESS",
                message: "A payment for this piece is already in progress.",
                viewerState,
              }
            : {
                code: "PRODUCT_RESERVED",
                message: "This piece is still attached to a payment attempt.",
                ...(viewerState ? { viewerState } : {}),
              },
          409,
        );
      }

      // Sold is final regardless of mutable catalogue classification. Check
      // it before the made-to-order blouse exception so a sold one-of-one
      // product can never be made purchasable again by changing its type.
      if (product.stockStatus === "sold") {
        return c.json(
          {
            code: "PRODUCT_SOLD",
            message: "This saree has found its next home.",
            viewerState: "sold" satisfies ViewerProductState,
          },
          409,
        );
      }

      // Blouses are made to order, never one-of-one, so they carry no hold and
      // stay available to every other shopper.
      const blouseIds = await getBlouseProductIdSet([productId]);
      if (blouseIds.has(productId)) {
        const saved = await upsertUnreservedCartItem({
          productId,
          selectedOptions: selectedOptions ?? null,
          userId,
        });
        if (!saved) {
          return c.json(
            { code: "PRODUCT_NOT_FOUND", message: "Product not found." },
            404,
          );
        }
        return c.json(
          {
            item: await readSavedItem("in_my_cart"),
            viewerState: "in_my_cart" satisfies ViewerProductState,
          },
          200
        );
      }

      /*
       * The holder asking again gets their own hold back, unchanged.
       *
       * A retry, a double click or a second tab must not read as another
       * shopper's claim. The clock is deliberately not extended — nobody may
       * hold a saree indefinitely by clicking again. Ownership is the shared
       * verdict, so a line mid-payment says payment_pending only when it is
       * the exact current payment hold.
       */
      const existingState = await readViewerState();
      if (existingState === "in_my_cart" || existingState === "payment_pending") {
        return c.json(
          { item: await readSavedItem(existingState), viewerState: existingState },
          200
        );
      }

      // One value, signed and written: the token must prove the exact hold the
      // row carries, or the release path can never match it again.
      const reservedUntil = getCartReservationExpiresAt(now);
      let reservationToken: string;
      try {
        reservationToken = createReservationToken({ productId, reservedUntil });
      } catch {
        return c.json(
          {
            code: "RESERVATION_TOKEN_SECRET_MISSING",
            message: "Reservation token signing is not configured.",
          },
          500
        );
      }

      const claimed = await claimProductIntoCart({
        now,
        productId,
        reservationToken,
        reservedUntil,
        selectedOptions: selectedOptions ?? null,
        userId,
      });

      if (!claimed) {
        /*
         * A same-account double click can start before either request sees the
         * other's bag row. The losing UPDATE waits for the winner, then matches
         * nothing. Read the verdict once after that wait: if the exact live
         * hold now belongs to this account, this was an idempotent retry, not
         * another shopper. The existing timestamp is returned unchanged, so
         * retries never extend the reservation window.
         */
        const currentState = await readViewerState();
        if (currentState === "in_my_cart" || currentState === "payment_pending") {
          return c.json(
            { item: await readSavedItem(currentState), viewerState: currentState },
            200,
          );
        }

        return c.json(
          currentState === "sold"
            ? {
                code: "PRODUCT_SOLD",
                message: "This saree has found its next home.",
                viewerState: currentState,
              }
            : {
                code: "PRODUCT_RESERVED",
                message: "This piece has just been reserved.",
                ...(currentState ? { viewerState: currentState } : {}),
              },
          409
        );
      }

      revalidateProductsCache([claimed.slug]);

      return c.json(
        {
          item: await readSavedItem("in_my_cart"),
          viewerState: "in_my_cart" satisfies ViewerProductState,
        },
        200
      );
    }
  );

  /*
   * Take a saree out of the signed-in shopper's bag.
   *
   * Only an exact reserved_until match releases the hold. That equality is the
   * one thing binding a bag row to the reservation actually on the product —
   * the checkout path re-stamps reserved_until and re-signs that payment
   * window, so an old signed token must never release the newer hold.
   *
   * Idempotent: a line that is already gone answers as a handled removal, and
   * every answer carries the same verdict the cards read.
   */
  app.openapi(
    createRoute({
      method: "delete",
      path: "/items/{productId}",
      request: { params: cartItemParamSchema },
      responses: {
        200: { description: "Item removed from, or already absent from, the authenticated bag" },
        401: { description: "Authentication required" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Reservation ownership proof is invalid",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      c.header("Cache-Control", "private, no-store");

      const { productId } = c.req.valid("param");
      const userId = authUserOrResponse.id;
      const now = new Date();
      const requestId = c.req.header("x-ftt-request-id") ?? newCartRequestId();

      /*
       * This shopper's own lapsed payment on this piece is settled with the
       * provider first, so the removal acts on what it became: a restored
       * hold releases, a capture reads Sold, an unresolved one stays a
       * payment in progress.
       */
      await reconcileLapsedOwnPayments({ now, productIds: [productId], userId });

      /*
       * Ordinary lapsed holds are freed first. A pending payment is only
       * reported here, never decided: whether it protects this line is the
       * locked removal statement's call, so a historical or foreign pending
       * order cannot block this shopper's removal.
       */
      const expiry = await expireCommerceHoldsForProducts([productId], now);
      if (expiry.paymentReleasedSlugs.length > 0) {
        revalidateProductsCache(expiry.paymentReleasedSlugs);
      }
      const readViewerState = () =>
        readViewerVerdict({
          now,
          paymentProtected: expiry.blockedProductIds.includes(productId),
          productId,
          userId,
        });

      const alreadyRemovedResponse = async () => {
        const viewerState = await readViewerState();
        if (viewerState) {
          return c.json(
            {
              productId,
              reason: "ALREADY_REMOVED",
              released: false,
              removed: true,
              viewerState,
            },
            200,
          );
        }

        /*
         * No verdict means the piece is not published. A draft or unpublished
         * piece still exists, so a retry for it is a handled removal too, with
         * no verdict to invent. Only an id naming no product at all is a 404,
         * so this lookup deliberately ignores status.
         */
        const [existingProduct] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        if (!existingProduct) {
          return c.json(
            { code: "PRODUCT_NOT_FOUND", message: "Product not found." },
            404,
          );
        }

        return c.json(
          {
            productId,
            reason: "ALREADY_REMOVED",
            released: false,
            removed: true,
          },
          200,
        );
      };

      const item = await getUserCartItem(userId, productId);
      if (!item) {
        logCartRemoveServer({
          cartRowFound: false,
          productId,
          reason: "NOT_IN_BAG",
          requestId,
          userId,
        });
        return alreadyRemovedResponse();
      }

      const proof = item.reservationToken
        ? verifyReservationToken(item.reservationToken)
        : null;
      const tokenValid =
        item.reservedUntil == null
          ? item.reservationToken == null
          : proof?.productId === productId &&
            proof.reservedUntil.getTime() === item.reservedUntil.getTime();
      const result = await removeOwnedCartItem({
        now,
        productId,
        reservationToken: tokenValid ? item.reservationToken : null,
        reservedUntil: tokenValid ? item.reservedUntil : null,
        userId,
      });
      // A concurrent removal committed first: the retry is already done.
      if (!result) {
        return alreadyRemovedResponse();
      }

      if (result.released) revalidateProductsCache([result.slug]);

      const viewerState = await readViewerState();

      logCartRemoveServer({
        cartReservedUntil: result.cartReservedUntil?.toISOString() ?? null,
        cartRowFound: true,
        exactReservationMatch: result.exactReservationMatch,
        paymentHoldActive: result.paymentHoldActive,
        productId,
        productReservedUntil: result.productReservedUntil?.toISOString() ?? null,
        productStockStatus: result.productStockStatus,
        reason: result.reason,
        released: result.released,
        removed: result.removed,
        requestId,
        tokenValid,
        userId,
        viewerState: viewerState ?? undefined,
      });

      if (!result.removed && result.reason === "RELEASE_MISSED") {
        return c.json(
          {
            code: "RESERVATION_PROOF_INVALID",
            message: "This bag could not prove ownership of the active hold.",
            ...(viewerState ? { viewerState } : {}),
          },
          409,
        );
      }

      /*
       * REMOVED_PAYMENT_PROTECTED is a handled removal as well: the line went,
       * while a pending order that is not this shopper's payment keeps the
       * piece held for reconciliation, and the verdict says so.
       */
      return c.json(
        {
          productId,
          reason: result.reason,
          released: result.released,
          removed: result.removed,
          ...(viewerState ? { viewerState } : {}),
        },
        200
      );
    }
  );

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
        410: {
          description: "Legacy unauthenticated cart reservations are disabled",
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
    async (c) =>
      c.json(
        {
          code: "LEGACY_CART_DISABLED",
          message: "Please sign in and add this piece to your bag again.",
        },
        410,
      ),
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
            product.reservedUntil.getTime() === verifiedToken.reservedUntil.getTime();

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

        // Only reachable once the token is proven non-null and matching.
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
            message: "This item does not have an active reservation to release.",
            released: false,
          },
          200
        );
      }

      const released = isActiveReservation
        ? await releaseCartHoldByToken({
            now,
            productId,
            reservationToken: reservationToken!,
            reservedUntil: activeReservationUntil!,
          })
        : (await expireCommerceHoldsForProducts([productId], now)).releasedProductIds.includes(productId)
          ? { productId, slug: product.slug }
          : null;

      if (!released) {
        return c.json(
          {
            code: "RESERVATION_NOT_ACTIVE",
            message: "This item does not have an active reservation to release.",
            released: false,
          },
          200
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
      const sweptAt = new Date();
      const expiry = await expireCommerceHoldsForProducts(expiredIds, sweptAt);
      const releasedIds = expiry.releasedProductIds;
      const releasedSet = new Set(releasedIds);
      const releasedRows = expiredRows.filter((row) => releasedSet.has(row.id));
      const releasedSlugs = [
          ...new Set([
          ...expiry.paymentReleasedSlugs,
          ...releasedRows.map((row) => row.slug),
        ]),
      ];
      if (releasedSlugs.length > 0) {
        revalidateProductsCache(releasedSlugs);
      }

      return c.json(
        {
          released: releasedIds.length,
          paymentReleaseConflicts: expiry.conflictOrderIds.length,
        },
        200
      );
    }
  );
};
