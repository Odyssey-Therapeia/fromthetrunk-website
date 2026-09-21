/**
 * P6-04: Wishlist DB queries — auth-scoped per user.
 *
 * All mutations include userId in the WHERE / VALUES so a user cannot
 * read or modify another user's wishlist (no IDOR).
 *
 * mergeGuestWishlist: called on login to fold a guest (cookie-backed)
 * wishlist into the account row. De-duplicated via onConflictDoNothing.
 */

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { products, restockNotifyRequests, wishlistItems } from "@/db/schema";
import { timedRows } from "@/lib/perf/timed";

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return all product IDs in a user's wishlist.
 * Auth-scoped: WHERE user_id = :userId.
 */
export async function listWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await timedRows("wishlist.productIds", () =>
    db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(eq(wishlistItems.userId, userId)),
  );

  return rows.map((row) => row.productId);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

const resultRows = (result: unknown): Array<Record<string, unknown>> =>
  (((result as { rows?: unknown[] } | null)?.rows ?? result) as Array<
    Record<string, unknown>
  >) ?? [];

/**
 * Save existing, non-sold products in one locked database command.
 *
 * The product lock closes the read-then-insert race with payment completion:
 * if a product has already become sold it cannot be newly saved, and if the
 * wishlist statement wins first then it was still eligible at save time.
 * Existing eligible rows are returned as accepted without rewriting them.
 */
async function saveEligibleWishlistProducts(
  userId: string,
  productIds: string[],
): Promise<string[]> {
  const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
  if (uniqueProductIds.length === 0) return [];

  const idList = sql.join(
    uniqueProductIds.map((productId) => sql`${productId}::uuid`),
    sql`, `,
  );
  const result = await db.execute(sql`
    WITH eligible_products AS MATERIALIZED (
      SELECT product.id
      FROM products AS product
      WHERE product.id IN (${idList})
        AND product.status IN ('draft', 'published')
        AND product.stock_status <> 'sold'
      ORDER BY product.id
      FOR UPDATE OF product
    ),
    inserted AS (
      INSERT INTO wishlist_items (user_id, product_id)
      SELECT ${userId}::uuid, eligible_product.id
      FROM eligible_products AS eligible_product
      ON CONFLICT (user_id, product_id) DO NOTHING
      RETURNING product_id
    )
    SELECT eligible_product.id AS product_id
    FROM eligible_products AS eligible_product
    LEFT JOIN inserted
      ON inserted.product_id = eligible_product.id
  `);

  return resultRows(result).map((row) => String(row.product_id));
}

/** Add one non-sold product. Repeating an eligible save is idempotent. */
export async function addToWishlist(
  userId: string,
  productId: string,
): Promise<boolean> {
  const acceptedProductIds = await saveEligibleWishlistProducts(userId, [productId]);
  return acceptedProductIds.includes(productId);
}

/**
 * Remove a product from a user's wishlist.
 * Auth-scoped: WHERE user_id = :userId AND product_id = :productId.
 * A user cannot remove items from another user's list.
 */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.productId, productId)
      )
    );
}

/**
 * Merge a guest (cookie-backed) wishlist into a user account on login.
 * De-duplicated — any productId already in the account wishlist is skipped.
 * No data is lost and no cross-user merge can occur (userId is fixed).
 */
export async function mergeGuestWishlist(
  userId: string,
  guestProductIds: string[]
): Promise<string[]> {
  return saveEligibleWishlistProducts(userId, guestProductIds);
}

// ── Restock notify ────────────────────────────────────────────────────────────

/**
 * Record a restock-notify intent only while another customer holds the item.
 * Composite PK (product_id, email) ensures at-most-one request per email per
 * product. New callers are authenticated; nullable userId preserves legacy
 * rows created before that cutover.
 */
export async function upsertRestockNotifyRequest(
  productId: string,
  email: string,
  userId?: string
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("RESTOCK_EMAIL_REQUIRED");

  /*
   * Eligibility and persistence are one database command.
   *
   * Reading `products` and inserting later left a race where a piece could be
   * sold or released between those operations, producing a request that could
   * never usefully send. The materialized eligibility CTE locks the product
   * until this INSERT/UPSERT finishes, serialising it with add/release writes.
   *
   * Eligibility is exactly what the viewer verdict calls reserved_by_other,
   * so Notify Me is never offered where it would be refused. The piece is
   * held while its hold is live, or past that time while any pending order
   * still reserves it at that exact expiry — the same protection the sweep
   * and the claim guard use, resolved only by provider-aware reconciliation.
   * The requester's own hold is refused: while live, their bag line at that
   * exact expiry (in the bag or in payment); past that time, only their
   * exact current payment hold, because a lapsed bag line owns nothing.
   *
   * An active subscription is idempotent. Repeating Notify Me while it is
   * pending or claimed must not reset its attempts, claim lease, lifecycle, or
   * created_at request version. Once that subscription is terminal (notified
   * or failed), an explicit new click starts a fresh cycle by resetting only
   * that terminal row. This keeps the existing composite identity and avoids
   * another table or request-id column.
   *
   * The subscription belongs to the account, so the same holds across an
   * email change: while this account's subscription under its old address is
   * still active, a click under the new one is that same registration and
   * writes nothing. Claiming mails the account's current address either way,
   * so a second row would only send the same email twice.
   */
  const result = await db.execute(sql`
    WITH eligible_product AS MATERIALIZED (
      SELECT product.id
      FROM products AS product
      WHERE product.id = ${productId}::uuid
        AND product.status = 'published'
        AND product.stock_status = 'reserved'
        AND product.reserved_until IS NOT NULL
        AND (
          product.reserved_until > statement_timestamp()
          OR EXISTS (
            SELECT 1
            FROM reservations AS payment_reservation
            JOIN orders AS payment_order
              ON payment_order.id = payment_reservation.order_id
             AND payment_order.payment_status = 'pending'
            WHERE payment_reservation.product_id = product.id
              AND payment_reservation.expires_at = product.reserved_until
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_cart_items AS cart
          WHERE cart.user_id = ${userId ?? null}::uuid
            AND cart.product_id = product.id
            AND cart.status IN ('active', 'payment_pending')
            AND cart.reserved_until = product.reserved_until
            AND (
              product.reserved_until > statement_timestamp()
              OR (
                cart.status = 'payment_pending'
                AND EXISTS (
                  SELECT 1
                  FROM reservations AS own_reservation
                  JOIN orders AS own_order
                    ON own_order.id = own_reservation.order_id
                   AND own_order.payment_status = 'pending'
                  WHERE own_order.user_id = cart.user_id
                    AND own_reservation.product_id = product.id
                    AND own_reservation.expires_at = product.reserved_until
                )
              )
            )
        )
      FOR UPDATE OF product
    ),
    account_subscription AS MATERIALIZED (
      SELECT active_request.product_id
      FROM restock_notify_requests AS active_request
      JOIN eligible_product ON eligible_product.id = active_request.product_id
      WHERE active_request.user_id = ${userId ?? null}::uuid
        AND active_request.email <> ${normalizedEmail}
        AND active_request.status IN ('pending', 'claimed')
    ),
    registered AS (
      INSERT INTO restock_notify_requests AS existing_request (
        product_id,
        email,
        user_id,
        status,
        attempt_count,
        claimed_at,
        last_attempt_at,
        last_error,
        notified_at,
        created_at
      )
      SELECT eligible_product.id,
             ${normalizedEmail},
             ${userId ?? null}::uuid,
             'pending',
             0,
             NULL,
             NULL,
             NULL,
             NULL,
             statement_timestamp()
      FROM eligible_product
      WHERE NOT EXISTS (SELECT 1 FROM account_subscription)
      ON CONFLICT (product_id, email) DO UPDATE SET
        user_id = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.user_id
          ELSE COALESCE(existing_request.user_id, EXCLUDED.user_id)
        END,
        status = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.status
          ELSE existing_request.status
        END,
        attempt_count = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.attempt_count
          ELSE existing_request.attempt_count
        END,
        claimed_at = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.claimed_at
          ELSE existing_request.claimed_at
        END,
        last_attempt_at = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.last_attempt_at
          ELSE existing_request.last_attempt_at
        END,
        last_error = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.last_error
          ELSE existing_request.last_error
        END,
        notified_at = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.notified_at
          ELSE existing_request.notified_at
        END,
        created_at = CASE
          WHEN existing_request.status IN ('notified', 'failed')
            THEN EXCLUDED.created_at
          ELSE existing_request.created_at
        END
      RETURNING product_id
    )
    SELECT product_id FROM registered
    UNION ALL
    SELECT product_id FROM account_subscription
  `);
  const rows = ((result as { rows?: unknown[] } | null)?.rows ?? result) as
    | unknown[]
    | undefined;
  return Array.isArray(rows) && rows.length > 0;
}

/** How long a piece must stay free before anyone is told it came back. */
export const RESTOCK_STABILISATION_MS = 60_000;
/** A crashed worker's claim becomes eligible for another run after this lease. */
export const RESTOCK_CLAIM_LEASE_MS = 10 * 60_000;
/** Give up after this many failed sends, so one bad address is not retried forever. */
export const RESTOCK_MAX_ATTEMPTS = 3;
/** Keeps a malformed/internal caller from creating an unbounded cron run. */
export const RESTOCK_MAX_CLAIM_LIMIT = 50;

export type ClaimedRestockRequest = {
  attemptCount: number;
  claimedAt: Date;
  /** The subscription key, normalised; used to finish or release the claim. */
  email: string;
  productId: string;
  productName: string;
  productSlug: string;
  /** The account's current address, which is where the email goes. */
  recipientEmail: string;
  /** Changes when the same shopper registers for the same piece again. */
  requestVersion: string;
};

/**
 * Take ownership of restock requests whose piece is genuinely back.
 *
 * Claiming and selecting are one statement with SKIP LOCKED, so two cron runs
 * can never hand the same shopper the same email. The stabilisation window is
 * part of the predicate rather than a delay: a piece that was released and
 * immediately re-added by the same buyer never qualifies, so nobody is told
 * "it's back" about a saree that is already gone again.
 *
 * A subscription belongs to its account, and the email goes to the address the
 * account holds now. The row's own email is only its key, so a verified email
 * change after registering never orphans it. Rows left over from the old guest
 * capture have no user and are never claimed; they need no migration, they
 * simply never send.
 */
export async function claimRestockRequests(
  limit = RESTOCK_MAX_CLAIM_LIMIT,
  now = new Date(),
): Promise<ClaimedRestockRequest[]> {
  const stableSince = new Date(now.getTime() - RESTOCK_STABILISATION_MS);
  const staleClaimedBefore = new Date(now.getTime() - RESTOCK_CLAIM_LEASE_MS);
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), RESTOCK_MAX_CLAIM_LIMIT))
    : RESTOCK_MAX_CLAIM_LIMIT;

  /*
   * The recipient travels through the CTE because an UPDATE's FROM joins
   * cannot refer back to the row being updated.
   */
  const claimed = await db.execute(sql`
    WITH claimable AS (
      SELECT r.product_id, r.email, u.email AS recipient_email
      FROM restock_notify_requests r
      JOIN products p ON p.id = r.product_id
      JOIN users u ON u.id = r.user_id
      WHERE (
          r.status = 'pending'
          OR (
            r.status = 'claimed'
            AND (r.claimed_at IS NULL OR r.claimed_at <= ${staleClaimedBefore})
          )
        )
        AND r.user_id IS NOT NULL
        AND r.attempt_count < ${RESTOCK_MAX_ATTEMPTS}
        AND p.status = 'published'
        AND p.stock_status = 'available'
        AND p.reserved_until IS NULL
        AND p.updated_at <= ${stableSince}
      ORDER BY r.created_at
      LIMIT ${boundedLimit}
      FOR UPDATE OF r SKIP LOCKED
    )
    UPDATE restock_notify_requests AS r
    SET status = 'claimed', claimed_at = ${now}
    FROM claimable c
    JOIN products p ON p.id = c.product_id
    WHERE r.product_id = c.product_id AND r.email = c.email
    RETURNING r.product_id, r.email, c.recipient_email, r.attempt_count,
              r.claimed_at, r.created_at, p.name AS product_name,
              p.slug AS product_slug
  `);

  const rows = ((claimed as unknown as { rows?: unknown[] }).rows ??
    claimed) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    attemptCount: Number(row.attempt_count ?? 0),
    claimedAt: new Date(String(row.claimed_at)),
    email: String(row.email),
    productId: String(row.product_id),
    productName: String(row.product_name ?? ""),
    productSlug: String(row.product_slug ?? ""),
    recipientEmail: String(row.recipient_email),
    requestVersion: String(row.created_at),
  }));
}

/** Mark a claimed request as delivered. */
export async function markRestockRequestNotified(
  productId: string,
  email: string,
  claimedAt: Date,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(restockNotifyRequests)
    .set({
      attemptCount: sql`${restockNotifyRequests.attemptCount} + 1`,
      lastAttemptAt: now,
      lastError: null,
      notifiedAt: now,
      status: "notified",
    })
    .where(
      and(
        eq(restockNotifyRequests.productId, productId),
        eq(restockNotifyRequests.email, email),
        eq(restockNotifyRequests.status, "claimed"),
        eq(restockNotifyRequests.claimedAt, claimedAt),
      ),
    )
    .returning({ productId: restockNotifyRequests.productId });

  return rows.length > 0;
}

/**
 * Hand a claimed request back.
 *
 * `retryable` returns it to the queue until the attempt ceiling; anything else
 * — the piece went again before the email left — simply waits for the next
 * time it comes back.
 */
export async function releaseRestockRequest(
  productId: string,
  email: string,
  claimedAt: Date,
  outcome: { reason: null | string; retryable: boolean },
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(restockNotifyRequests)
    .set({
      attemptCount: outcome.retryable
        ? sql`${restockNotifyRequests.attemptCount} + 1`
        : restockNotifyRequests.attemptCount,
      claimedAt: null,
      lastAttemptAt: outcome.retryable ? now : null,
      lastError: outcome.reason,
      status: outcome.retryable
        ? sql`CASE WHEN ${restockNotifyRequests.attemptCount} + 1 >= ${RESTOCK_MAX_ATTEMPTS}
                   THEN 'failed' ELSE 'pending' END`
        : "pending",
    })
    .where(
      and(
        eq(restockNotifyRequests.productId, productId),
        eq(restockNotifyRequests.email, email),
        eq(restockNotifyRequests.status, "claimed"),
        eq(restockNotifyRequests.claimedAt, claimedAt),
      ),
    )
    .returning({ productId: restockNotifyRequests.productId });

  return rows.length > 0;
}
