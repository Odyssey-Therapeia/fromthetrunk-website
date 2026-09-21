/**
 * The authenticated shopping bag's data layer.
 *
 * Every function here is scoped to one userId, taken from the server session —
 * never from a request body — so one customer can never read or mutate
 * another's bag.
 *
 * Reservation identity stays exactly where it was: products.reserved_until
 * plus the signed token. These rows record who received a hold; they never
 * become the proof of it, and nothing here may release a hold on an
 * approximate timestamp match.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, withRetry } from "@/db";
import {
  orders,
  products,
  productTypes,
  reservations,
  userCartItems,
} from "@/db/schema";
import {
  CART_RESERVATION_MINUTES,
  getCartReservationExpiresAt,
  PAYMENT_LINK_HOLD_MINUTES,
} from "@/lib/cart/reservation-policy";
import { isBlouseProduct } from "@/lib/products/product-type";

export type UserCartItemRow = {
  addedAt: Date;
  productId: string;
  reservationToken: null | string;
  reservedUntil: Date | null;
  selectedOptions: Record<string, unknown> | null;
  status: string;
};

const LIVE_CART_STATUSES = ["active", "payment_pending"];

const resultRows = (result: unknown): Array<Record<string, unknown>> =>
  (((result as { rows?: unknown[] } | null)?.rows ?? result) as Array<
    Record<string, unknown>
  >) ?? [];

/** One customer's live bag, freshest first. */
export async function listUserCartItems(
  userId: string,
): Promise<UserCartItemRow[]> {
  return withRetry(() =>
    db
      .select({
        addedAt: userCartItems.addedAt,
        productId: userCartItems.productId,
        reservationToken: userCartItems.reservationToken,
        reservedUntil: userCartItems.reservedUntil,
        selectedOptions: userCartItems.selectedOptions,
        status: userCartItems.status,
      })
      .from(userCartItems)
      .where(
        and(
          eq(userCartItems.userId, userId),
          inArray(userCartItems.status, LIVE_CART_STATUSES),
        ),
      ),
  );
}

/** One bag line, or null. Scoped to the owner. */
export async function getUserCartItem(
  userId: string,
  productId: string,
): Promise<UserCartItemRow | null> {
  const [row] = await withRetry(() =>
    db
      .select({
        addedAt: userCartItems.addedAt,
        productId: userCartItems.productId,
        reservationToken: userCartItems.reservationToken,
        reservedUntil: userCartItems.reservedUntil,
        selectedOptions: userCartItems.selectedOptions,
        status: userCartItems.status,
      })
      .from(userCartItems)
      .where(
        and(
          eq(userCartItems.userId, userId),
          eq(userCartItems.productId, productId),
        ),
      )
      .limit(1),
  );

  return row ?? null;
}

export type RemoveOwnedCartItemResult = {
  cartReservedUntil: Date | null;
  exactReservationMatch: boolean;
  paymentHoldActive: boolean;
  /** Any pending order still reserves the piece at its exact expiry. */
  paymentProtected: boolean;
  productReservedUntil: Date | null;
  productStockStatus: string;
  reason:
    | "PAYMENT_IN_PROGRESS"
    | "RELEASED"
    | "RELEASE_MISSED"
    | "REMOVED_PAYMENT_PROTECTED"
    | "SOLD"
    | "STALE_ROW"
    | "UNRESERVED";
  released: boolean;
  removed: boolean;
  slug: string;
  viewerState:
    | "available"
    | "payment_pending"
    | "reserved_by_other"
    | "sold";
};

/**
 * Remove one authenticated bag line without ever separating the row from the
 * inventory hold it owns.
 *
 * `locked` serialises this command with checkout on both rows. `removed`
 * depends on `released`, so an exact one-of-one line is deleted only after its
 * product was made available by this same SQL statement. Only this shopper's
 * exact current payment hold keeps both rows untouched: their pending order at
 * the product's expiry, and this very row in payment at that same instant. It
 * has no clock bound — a lapsed link stays protected until provider-aware
 * reconciliation resolves it — while a historical pending order that fails any
 * condition never blocks. A stale line may be dropped but can never release
 * the product whose timestamp no longer matches it.
 *
 * Inventory is guarded more broadly than the line. While any pending order
 * still reserves the piece at its exact expiry, nothing here makes it
 * available. That order is not this shopper's current payment, so their line
 * still goes, even one matching the hold exactly, and the piece stays held
 * for provider-aware reconciliation (REMOVED_PAYMENT_PROTECTED).
 */
export async function removeOwnedCartItem({
  now = new Date(),
  productId,
  reservationToken,
  reservedUntil,
  userId,
}: {
  now?: Date;
  productId: string;
  reservationToken?: null | string;
  reservedUntil?: Date | null;
  userId: string;
}): Promise<RemoveOwnedCartItemResult | null> {
  const result = await withRetry(() =>
    db.execute(sql`
      WITH locked_product AS MATERIALIZED (
        SELECT product.id,
               product.reserved_until,
               product.slug,
               product.stock_status
        FROM products AS product
        WHERE product.id = ${productId}::uuid
        FOR UPDATE OF product
      ),
      locked AS MATERIALIZED (
        SELECT cart.reservation_token AS cart_reservation_token,
               cart.reserved_until AS cart_reserved_until,
               cart.status AS cart_status,
               locked_product.reserved_until AS product_reserved_until,
               locked_product.slug,
               locked_product.stock_status AS product_stock_status
        FROM locked_product
        JOIN user_cart_items AS cart
          ON cart.product_id = locked_product.id
        WHERE cart.user_id = ${userId}::uuid
          AND cart.product_id = ${productId}::uuid
        FOR UPDATE OF cart
      ),
      payment_protection AS MATERIALIZED (
        SELECT EXISTS (
          SELECT 1
          FROM reservations AS protecting_reservation
          JOIN orders AS protecting_order
            ON protecting_order.id = protecting_reservation.order_id
           AND protecting_order.payment_status = 'pending'
          WHERE protecting_reservation.product_id = ${productId}::uuid
            AND protecting_reservation.expires_at = locked.product_reserved_until
        ) AS active
        FROM locked
      ),
      payment_hold AS MATERIALIZED (
        SELECT EXISTS (
          SELECT 1
          FROM reservations
          JOIN orders ON orders.id = reservations.order_id
          WHERE orders.user_id = ${userId}::uuid
            AND orders.payment_status = 'pending'
            AND reservations.product_id = ${productId}::uuid
            AND reservations.expires_at = locked.product_reserved_until
            AND locked.product_stock_status = 'reserved'
            AND locked.cart_status = 'payment_pending'
            AND locked.cart_reserved_until = locked.product_reserved_until
        ) AS active
        FROM locked
      ),
      released AS (
        UPDATE products AS product
        SET stock_status = 'available',
            reserved_until = NULL,
            quantity_available = 1,
            updated_at = statement_timestamp()
        FROM locked, payment_hold, payment_protection
        WHERE product.id = ${productId}::uuid
          AND payment_hold.active = FALSE
          AND payment_protection.active = FALSE
          AND product.stock_status = 'reserved'
          AND ${reservationToken ?? null}::text IS NOT NULL
          AND locked.cart_reservation_token = ${reservationToken ?? null}::text
          AND locked.cart_reserved_until = ${reservedUntil ?? null}::timestamptz
          AND locked.cart_reserved_until IS NOT NULL
          AND product.reserved_until = locked.cart_reserved_until
        RETURNING product.id
      ),
      removed AS (
        DELETE FROM user_cart_items AS cart
        USING locked, payment_hold, payment_protection
        WHERE cart.user_id = ${userId}::uuid
          AND cart.product_id = ${productId}::uuid
          AND (
            EXISTS (SELECT 1 FROM released)
            OR locked.product_stock_status = 'sold'
            OR (
              payment_hold.active = FALSE
              AND (
                payment_protection.active = TRUE
                OR NOT (
                  locked.product_stock_status = 'reserved'
                  AND locked.cart_reserved_until IS NOT NULL
                  AND locked.product_reserved_until = locked.cart_reserved_until
                )
              )
            )
          )
        RETURNING cart.product_id
      )
      SELECT locked.cart_reserved_until,
             locked.product_reserved_until,
             locked.product_stock_status,
             locked.slug,
             payment_hold.active AS payment_hold_active,
             payment_protection.active AS payment_protected,
             EXISTS (SELECT 1 FROM released) AS released,
             EXISTS (SELECT 1 FROM removed) AS removed
      FROM locked, payment_hold, payment_protection
    `),
  );

  const row = resultRows(result)[0];
  if (!row) return null;

  const cartReservedUntil = row.cart_reserved_until
    ? new Date(String(row.cart_reserved_until))
    : null;
  const productReservedUntil = row.product_reserved_until
    ? new Date(String(row.product_reserved_until))
    : null;
  const productStockStatus = String(row.product_stock_status);
  const paymentHoldActive = Boolean(row.payment_hold_active);
  const paymentProtected = Boolean(row.payment_protected);
  const released = Boolean(row.released);
  const removed = Boolean(row.removed);
  const exactReservationMatch =
    cartReservedUntil != null &&
    productReservedUntil != null &&
    cartReservedUntil.getTime() === productReservedUntil.getTime();

  // A protected piece stays held past its time, so it is never offered back.
  const viewerState =
    productStockStatus === "sold"
      ? "sold"
      : paymentHoldActive && !removed
        ? "payment_pending"
        : released
          ? "available"
          : productStockStatus === "reserved" &&
              productReservedUntil != null &&
              (paymentProtected || productReservedUntil > now)
            ? "reserved_by_other"
            : "available";

  const reason =
    productStockStatus === "sold"
      ? "SOLD"
      : paymentHoldActive && !removed
        ? "PAYMENT_IN_PROGRESS"
        : released
          ? "RELEASED"
          : removed &&
              paymentProtected &&
              exactReservationMatch &&
              productStockStatus === "reserved"
            ? "REMOVED_PAYMENT_PROTECTED"
            : removed && cartReservedUntil == null
              ? "UNRESERVED"
              : removed
                ? "STALE_ROW"
                : "RELEASE_MISSED";

  return {
    cartReservedUntil,
    exactReservationMatch,
    paymentHoldActive,
    paymentProtected,
    productReservedUntil,
    productStockStatus,
    reason,
    released,
    removed,
    slug: String(row.slug),
    viewerState,
  };
}

/**
 * Compatibility release for the old token-based endpoint.
 *
 * The signed token is verified by the route before this command is called.
 * Releasing the product and deleting any exact account-bag copy happen in the
 * same statement, so an old tab cannot leave an available saree stuck in a
 * shopper's bag. An exact pending-order reservation blocks this path.
 */
export async function releaseCartHoldByToken({
  now = new Date(),
  productId,
  reservationToken,
  reservedUntil,
}: {
  now?: Date;
  productId: string;
  reservationToken: string;
  reservedUntil: Date;
}): Promise<{ productId: string; slug: string } | null> {
  const result = await withRetry(() =>
    db.execute(sql`
      WITH locked AS MATERIALIZED (
        SELECT product.id, product.slug, product.reserved_until
        FROM products AS product
        WHERE product.id = ${productId}::uuid
          AND product.stock_status = 'reserved'
          AND product.reserved_until = ${reservedUntil}
          AND NOT EXISTS (
            SELECT 1
            FROM reservations
            JOIN orders ON orders.id = reservations.order_id
            WHERE reservations.product_id = product.id
              AND reservations.expires_at = product.reserved_until
              AND orders.payment_status = 'pending'
          )
        FOR UPDATE OF product
      ),
      released AS (
        UPDATE products AS product
        SET stock_status = 'available',
            reserved_until = NULL,
            quantity_available = 1,
            updated_at = statement_timestamp()
        FROM locked
        WHERE product.id = locked.id
          AND product.stock_status = 'reserved'
          AND product.reserved_until = locked.reserved_until
        RETURNING product.id, product.slug
      ),
      removed AS (
        DELETE FROM user_cart_items AS cart
        USING locked, released
        WHERE cart.product_id = released.id
          AND locked.id = released.id
          AND cart.reservation_token = ${reservationToken}
          AND cart.reserved_until = locked.reserved_until
        RETURNING cart.product_id
      )
      SELECT released.id AS product_id, released.slug
      FROM released
    `),
  );

  const row = resultRows(result)[0];
  return row
    ? { productId: String(row.product_id), slug: String(row.slug) }
    : null;
}

/**
 * Free any of these sarees whose ordinary cart hold has lapsed, and drop the
 * bag lines that were holding them. A reservation attached to a pending order
 * is excluded in SQL and can only be resolved by the provider-aware cron.
 *
 * Called at the top of every request that reads or changes availability, so
 * ordinary-cart correctness never waits for a scheduled sweep: a shopper who
 * closed their tab cannot keep a piece off the shelf just because no cron ran.
 *
 * Narrow by design — only the products this request actually asked about.
 */
export async function expireHoldsForProducts(
  productIds: string[],
  now = new Date(),
): Promise<string[]> {
  const ids = [...new Set(productIds)].filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const result = await withRetry(() =>
    db.execute(sql`
      WITH input AS MATERIALIZED (
        SELECT value::uuid AS product_id
        FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      ),
      expired AS MATERIALIZED (
        SELECT product.id, product.reserved_until AS expired_until
        FROM products AS product
        JOIN input ON input.product_id = product.id
        WHERE product.stock_status = 'reserved'
          AND product.reserved_until IS NOT NULL
          AND product.reserved_until <= ${now}
          AND NOT EXISTS (
            SELECT 1
            FROM reservations AS payment_reservation
            JOIN orders AS payment_order
              ON payment_order.id = payment_reservation.order_id
             AND payment_order.payment_status = 'pending'
            WHERE payment_reservation.product_id = product.id
              AND payment_reservation.expires_at = product.reserved_until
          )
        ORDER BY product.id
        FOR UPDATE OF product
      ),
      freed AS (
        UPDATE products AS product
        SET quantity_available = 1,
            reserved_until = NULL,
            stock_status = 'available',
            updated_at = statement_timestamp()
        FROM expired
        WHERE product.id = expired.id
          AND product.stock_status = 'reserved'
          AND product.reserved_until = expired.expired_until
        RETURNING product.id
      ),
      removed AS (
        DELETE FROM user_cart_items AS cart
        USING expired, freed
        WHERE cart.product_id = freed.id
          AND expired.id = freed.id
          AND cart.reserved_until = expired.expired_until
        RETURNING cart.product_id
      )
      SELECT freed.id
      FROM freed
    `),
  );

  return resultRows(result).map((row) => String(row.id));
}

/**
 * Drop this shopper's bag lines that own nothing, before the bag is drawn.
 *
 * A line whose piece is gone, unpublished or sold, or an ordinary line whose
 * exact hold the product no longer carries — released, lapsed or re-claimed
 * by someone else — offers the shopper no action at all, so it goes in one
 * guarded statement. Two kinds of line are never touched: one in payment
 * (provider-aware reconciliation needs it) and a hold-free made-to-order line
 * whose piece can still be bought.
 *
 * Products are locked before lines, the order the claim takes them in. A
 * concurrent add therefore either finishes first, and its fresh hold is
 * compared against the latest version of the line, or waits for this one.
 */
export async function pruneUnownedCartRows({
  now = new Date(),
  userId,
}: {
  now?: Date;
  userId: string;
}): Promise<string[]> {
  const result = await withRetry(() =>
    db.execute(sql`
      WITH owned AS MATERIALIZED (
        SELECT cart.product_id
        FROM user_cart_items AS cart
        WHERE cart.user_id = ${userId}::uuid
          AND cart.status <> 'payment_pending'
      ),
      locked_products AS MATERIALIZED (
        SELECT product.id,
               product.reserved_until,
               product.status,
               product.stock_status
        FROM products AS product
        JOIN owned ON owned.product_id = product.id
        ORDER BY product.id
        FOR UPDATE OF product
      )
      DELETE FROM user_cart_items AS cart
      WHERE cart.user_id = ${userId}::uuid
        AND cart.status <> 'payment_pending'
        AND (
          NOT EXISTS (
            SELECT 1
            FROM locked_products AS purchasable
            WHERE purchasable.id = cart.product_id
              AND purchasable.status = 'published'
              AND purchasable.stock_status <> 'sold'
          )
          OR (
            cart.status = 'active'
            AND cart.reserved_until IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM locked_products AS holding
              WHERE holding.id = cart.product_id
                AND holding.stock_status = 'reserved'
                AND holding.reserved_until = cart.reserved_until
                AND holding.reserved_until > ${now}
            )
          )
        )
      RETURNING cart.product_id
    `),
  );

  return resultRows(result).map((row) => String(row.product_id));
}

/**
 * Save a bag line for a piece that carries no stock hold — a made-to-order
 * blouse. Never touches products.
 */
export async function upsertUnreservedCartItem({
  productId,
  selectedOptions,
  userId,
}: {
  productId: string;
  selectedOptions?: Record<string, unknown> | null;
  userId: string;
}): Promise<boolean> {
  const options = selectedOptions ? JSON.stringify(selectedOptions) : null;
  const result = await withRetry(() =>
    db.execute(sql`
      INSERT INTO user_cart_items (
        user_id, product_id, reservation_token, reserved_until,
        selected_options, status, added_at, updated_at
      )
      SELECT ${userId}::uuid, product.id, NULL, NULL,
             ${options}::jsonb, 'active', statement_timestamp(),
             statement_timestamp()
      FROM products AS product
      WHERE product.id = ${productId}::uuid
        AND product.status = 'published'
      ON CONFLICT (user_id, product_id) DO UPDATE SET
        reservation_token = NULL,
        reserved_until = NULL,
        selected_options = excluded.selected_options,
        status = 'active',
        updated_at = statement_timestamp()
      RETURNING product_id
    `),
  );

  return resultRows(result).length > 0;
}

/**
 * Claim a one-of-one saree and record the bag line in one statement.
 *
 * The two must not be separable. A product marked reserved with no bag row
 * behind it is a saree nobody can buy and nobody can release, held until the
 * expiry sweep catches it — so the insert reads FROM the claim, and if the
 * claim matches nothing the insert inserts nothing.
 *
 * The claim predicate is the same one the rest of the system uses, unchanged:
 * available, or a hold that has already lapsed. Nothing here widens it.
 *
 * Another account's leftover line for this saree cannot own the new hold, so
 * it goes in the same statement rather than lingering in that shopper's bag.
 */
export async function claimProductIntoCart({
  productId,
  reservationToken,
  reservedUntil,
  selectedOptions,
  userId,
  now = new Date(),
}: {
  productId: string;
  reservationToken: string;
  reservedUntil: Date;
  selectedOptions?: Record<string, unknown> | null;
  userId: string;
  now?: Date;
}): Promise<{ reservedUntil: Date; slug: string } | null> {
  const options = selectedOptions ? JSON.stringify(selectedOptions) : null;

  const result = await withRetry(() =>
    db.execute(sql`
      WITH claimed AS (
        UPDATE products
        SET stock_status = 'reserved',
            reserved_until = ${reservedUntil},
            quantity_available = 1,
            updated_at = statement_timestamp()
        WHERE id = ${productId}::uuid
          AND status = 'published'
          AND (
            stock_status = 'available'
            OR (stock_status = 'reserved' AND reserved_until <= ${now})
          )
          AND NOT EXISTS (
            SELECT 1
            FROM reservations AS payment_reservation
            JOIN orders AS payment_order
              ON payment_order.id = payment_reservation.order_id
             AND payment_order.payment_status = 'pending'
            WHERE payment_reservation.product_id = products.id
              AND payment_reservation.expires_at = products.reserved_until
          )
        RETURNING id, slug, reserved_until
      ),
      saved AS (
        INSERT INTO user_cart_items (
          user_id, product_id, reservation_token, reserved_until,
          selected_options, status, added_at, updated_at
        )
        SELECT ${userId}::uuid, claimed.id, ${reservationToken},
               claimed.reserved_until, ${options}::jsonb, 'active',
               ${now}, ${now}
        FROM claimed
        ON CONFLICT (user_id, product_id) DO UPDATE SET
          reservation_token = excluded.reservation_token,
          reserved_until = excluded.reserved_until,
          selected_options = excluded.selected_options,
          status = 'active',
          added_at = excluded.added_at,
          updated_at = ${now}
        RETURNING product_id
      ),
      displaced AS (
        DELETE FROM user_cart_items AS other
        USING claimed
        WHERE other.product_id = claimed.id
          AND other.user_id <> ${userId}::uuid
          AND other.status = 'active'
          AND other.reserved_until IS DISTINCT FROM claimed.reserved_until
        RETURNING other.product_id
      )
      SELECT claimed.slug, claimed.reserved_until
      FROM claimed
      JOIN saved ON saved.product_id = claimed.id
    `),
  );

  const rows = ((result as unknown as { rows?: unknown[] }).rows ??
    result) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;

  return {
    reservedUntil: new Date(String(row.reserved_until)),
    slug: String(row.slug),
  };
}

export type PaymentCartClaim = {
  currentReservationToken: string;
  paymentReservationToken: string;
  productId: string;
};

/**
 * Move every owned one-of-one cart hold into the payment window as one guarded
 * database command.
 *
 * The input contains server-created tokens only. `guarded` must see every
 * requested row in the active bag with the exact product timestamp before
 * either table is changed. The product update then feeds the cart update, so a
 * payment hold can never exist without the owner row carrying the same expiry.
 * The hold is capped here as well as by the caller: never more than ten
 * minutes after the order's own payment start (its placed_at), and never past
 * the line's original cart deadline. The caller's clock only decides liveness,
 * so a claim clock read after the order row was written can never refuse it.
 *
 * Products are locked in id order, as every multi-product statement here
 * locks them, so two of these statements can never deadlock on each other.
 */
export async function startPaymentForOwnedCartItems({
  items,
  now = new Date(),
  orderId,
  reservedUntil,
  userId,
}: {
  items: PaymentCartClaim[];
  now?: Date;
  orderId: string;
  reservedUntil: Date;
  userId: string;
}): Promise<Array<{ productId: string; slug: string }>> {
  if (items.length === 0) return [];

  const payload = JSON.stringify(
    items.map((item) => ({
      current_reservation_token: item.currentReservationToken,
      payment_reservation_token: item.paymentReservationToken,
      product_id: item.productId,
    })),
  );
  const result = await withRetry(() =>
    db.execute(sql`
      WITH input AS MATERIALIZED (
        SELECT item.product_id,
               item.current_reservation_token,
               item.payment_reservation_token
        FROM jsonb_to_recordset(${payload}::jsonb)
          AS item(
            product_id uuid,
            current_reservation_token text,
            payment_reservation_token text
          )
      ),
      locked_order AS MATERIALIZED (
        SELECT target.id, target.payment_status, target.placed_at
        FROM orders AS target
        WHERE target.id = ${orderId}::uuid
          AND target.user_id = ${userId}::uuid
        FOR UPDATE OF target
      ),
      locked_products AS MATERIALIZED (
        SELECT product.id,
               product.reserved_until,
               product.slug,
               product.stock_status
        FROM products AS product
        JOIN input ON input.product_id = product.id
        JOIN locked_order ON TRUE
        ORDER BY product.id
        FOR UPDATE OF product
      ),
      locked AS MATERIALIZED (
        SELECT input.product_id,
               input.current_reservation_token,
               input.payment_reservation_token,
               cart.added_at AS cart_added_at,
               cart.added_at + (${CART_RESERVATION_MINUTES} * INTERVAL '1 minute')
                 AS cart_deadline,
               cart.reservation_token AS cart_reservation_token,
               cart.reserved_until AS cart_reserved_until,
               cart.status AS cart_status,
               locked_products.reserved_until AS product_reserved_until,
               locked_products.slug,
               locked_products.stock_status,
               (
                 cart.status = 'payment_pending'
                 AND cart.reservation_token = input.payment_reservation_token
                 AND cart.reserved_until = ${reservedUntil}
                 AND locked_products.stock_status = 'reserved'
                 AND locked_products.reserved_until = ${reservedUntil}
                 AND ${reservedUntil} > ${now}
                 AND ${reservedUntil}::timestamptz <=
                   (SELECT locked_order.placed_at FROM locked_order)
                     + (${PAYMENT_LINK_HOLD_MINUTES} * INTERVAL '1 minute')
                 AND ${reservedUntil} <=
                   cart.added_at + (${CART_RESERVATION_MINUTES} * INTERVAL '1 minute')
                 AND EXISTS (
                   SELECT 1
                   FROM reservations AS existing_reservation
                   WHERE existing_reservation.order_id = ${orderId}::uuid
                     AND existing_reservation.product_id = input.product_id
                     AND existing_reservation.expires_at = ${reservedUntil}
                 )
               ) AS already_claimed
        FROM input
        JOIN locked_products ON locked_products.id = input.product_id
        JOIN user_cart_items AS cart
          ON cart.user_id = ${userId}::uuid
         AND cart.product_id = input.product_id
        WHERE cart.status IN ('active', 'payment_pending')
        FOR UPDATE OF cart
      ),
      guarded AS MATERIALIZED (
        SELECT COUNT(*) = (SELECT COUNT(*) FROM input)
               AND COALESCE(
                 (SELECT payment_status = 'pending' FROM locked_order),
                 FALSE
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM input
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM order_items AS order_item
                   WHERE order_item.order_id = ${orderId}::uuid
                     AND order_item.product_id = input.product_id
                 )
               )
               AND COALESCE(
                 BOOL_AND(
                   locked.already_claimed
                   OR (
                     locked.cart_status = 'active'
                     AND locked.stock_status = 'reserved'
                     AND locked.cart_reservation_token =
                       locked.current_reservation_token
                     AND locked.cart_reserved_until IS NOT NULL
                     AND locked.cart_reserved_until = locked.cart_deadline
                     AND locked.product_reserved_until = locked.cart_reserved_until
                     AND locked.product_reserved_until > ${now}
                     AND ${reservedUntil} > ${now}
                     AND ${reservedUntil}::timestamptz <=
                       (SELECT locked_order.placed_at FROM locked_order)
                         + (${PAYMENT_LINK_HOLD_MINUTES} * INTERVAL '1 minute')
                     AND ${reservedUntil} <= locked.cart_deadline
                     AND NOT EXISTS (
                       SELECT 1
                       FROM reservations AS conflicting_reservation
                       WHERE conflicting_reservation.order_id = ${orderId}::uuid
                         AND conflicting_reservation.product_id = locked.product_id
                     )
                   )
                 ),
                 FALSE
               ) AS ok
        FROM locked
      ),
      claimed AS (
        UPDATE products AS product
        SET reserved_until = ${reservedUntil},
            stock_status = 'reserved',
            updated_at = statement_timestamp()
        FROM locked, guarded
        WHERE guarded.ok
          AND product.id = locked.product_id
          AND locked.already_claimed = FALSE
          AND locked.cart_status = 'active'
          AND product.stock_status = 'reserved'
          AND product.reserved_until = locked.cart_reserved_until
        RETURNING product.id, product.slug
      ),
      payment_reservations AS (
        INSERT INTO reservations (order_id, product_id, qty, expires_at)
        SELECT ${orderId}::uuid, claimed.id, 1, ${reservedUntil}
        FROM claimed
        WHERE NOT EXISTS (
          SELECT 1
          FROM reservations AS existing_reservation
          WHERE existing_reservation.order_id = ${orderId}::uuid
            AND existing_reservation.product_id = claimed.id
            AND existing_reservation.expires_at = ${reservedUntil}
        )
        RETURNING product_id
      ),
      pending AS (
        UPDATE user_cart_items AS cart
        SET reservation_token = locked.payment_reservation_token,
            reserved_until = ${reservedUntil},
            status = 'payment_pending',
            updated_at = ${now}
        FROM locked
        JOIN claimed ON claimed.id = locked.product_id
        JOIN payment_reservations
          ON payment_reservations.product_id = claimed.id
        WHERE cart.user_id = ${userId}::uuid
          AND cart.product_id = locked.product_id
        RETURNING cart.product_id
      ),
      final_claimed AS MATERIALIZED (
        SELECT claimed.id AS product_id, claimed.slug
        FROM claimed
        JOIN pending ON pending.product_id = claimed.id
        UNION ALL
        SELECT locked.product_id, locked.slug
        FROM locked
        WHERE locked.already_claimed
      ),
      final_guard AS MATERIALIZED (
        SELECT COUNT(*) = (SELECT COUNT(*) FROM input) AS ok
        FROM final_claimed
      )
      SELECT final_claimed.product_id, final_claimed.slug
      FROM final_claimed, final_guard
      WHERE final_guard.ok
    `),
  );

  return resultRows(result).map((row) => ({
    productId: String(row.product_id),
    slug: String(row.slug),
  }));
}

export type PaymentCartRestoration = {
  cartDeadline: Date;
  paymentReservationToken: string;
  productId: string;
  restorationReservationToken: string;
};

export type ReleasePaymentCartItemsResult = {
  kind:
    | "already_failed"
    | "already_paid"
    | "order_state_conflict"
    | "ownership_conflict"
    | "released";
  releasedProductIds: string[];
  releasedSlugs: string[];
  restoredProductIds: string[];
  restoredSlugs: string[];
};

/**
 * Fail a terminal unpaid payment attempt and resolve its exact holds in one
 * statement.
 *
 * Before a line's original one-hour cart deadline, its product and bag row are
 * restored to that deadline with a newly signed token. At or after that
 * deadline they are released/deleted. The order, payment reservation, product,
 * bag token, expiry and original added_at must all agree, so stale provider
 * evidence can neither free a newer hold nor extend an older one.
 */
export async function releasePaymentCartItems({
  items,
  now = new Date(),
  orderId,
  reservedUntil,
  userId,
}: {
  items: PaymentCartRestoration[];
  now?: Date;
  orderId: string;
  reservedUntil: Date;
  userId: string;
}): Promise<ReleasePaymentCartItemsResult> {
  const expectedItems = items.filter((item) => item.productId.length > 0);
  const expectedPayload = JSON.stringify(
    expectedItems.map((item) => ({
      cart_deadline: item.cartDeadline,
      payment_reservation_token: item.paymentReservationToken,
      product_id: item.productId,
      restoration_reservation_token: item.restorationReservationToken,
    })),
  );

  const result = await withRetry(() =>
    db.execute(sql`
      WITH expected_input AS MATERIALIZED (
        SELECT item.product_id,
               item.cart_deadline,
               item.payment_reservation_token,
               item.restoration_reservation_token
        FROM jsonb_to_recordset(${expectedPayload}::jsonb)
          AS item(
            product_id uuid,
            cart_deadline timestamptz,
            payment_reservation_token text,
            restoration_reservation_token text
          )
      ),
      locked_order AS MATERIALIZED (
        SELECT target.id, target.payment_status, target.user_id
        FROM orders AS target
        WHERE target.id = ${orderId}::uuid
          AND target.user_id = ${userId}::uuid
        FOR UPDATE OF target
      ),
      reservation_keys AS MATERIALIZED (
        SELECT DISTINCT reservation.product_id
        FROM reservations AS reservation
        JOIN locked_order ON locked_order.id = reservation.order_id
      ),
      locked_products AS MATERIALIZED (
        SELECT product.id,
               product.reserved_until,
               product.slug,
               product.stock_status
        FROM products AS product
        JOIN reservation_keys ON reservation_keys.product_id = product.id
        ORDER BY product.id
        FOR UPDATE OF product
      ),
      locked_cart AS MATERIALIZED (
        SELECT cart.product_id,
               cart.added_at,
               cart.reservation_token,
               cart.reserved_until,
               cart.status
        FROM locked_products
        JOIN user_cart_items AS cart
          ON cart.user_id = ${userId}::uuid
         AND cart.product_id = locked_products.id
        FOR UPDATE OF cart
      ),
      locked_reservations AS MATERIALIZED (
        SELECT reservation.id,
               reservation.product_id,
               reservation.expires_at
        FROM reservations AS reservation
        JOIN locked_order ON locked_order.id = reservation.order_id
        CROSS JOIN (SELECT COUNT(*) FROM locked_cart) AS cart_lock_barrier
        FOR UPDATE OF reservation
      ),
      authority AS MATERIALIZED (
        SELECT locked_reservations.product_id,
               MIN(locked_reservations.expires_at) AS expires_at,
               COUNT(*) AS reservation_count
        FROM locked_reservations
        GROUP BY locked_reservations.product_id
      ),
      guarded AS MATERIALIZED (
        SELECT COALESCE(
                 (SELECT payment_status = 'pending' FROM locked_order),
                 FALSE
               )
               AND (SELECT COUNT(*) FROM locked_reservations) =
                   (SELECT COUNT(*) FROM authority)
               AND (SELECT COUNT(*) FROM locked_products) =
                   (SELECT COUNT(*) FROM authority)
               AND (SELECT COUNT(*) FROM locked_cart) =
                   (SELECT COUNT(*) FROM authority)
               AND NOT EXISTS (
                 SELECT 1
                 FROM locked_reservations
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM order_items AS order_item
                   WHERE order_item.order_id = ${orderId}::uuid
                     AND order_item.product_id = locked_reservations.product_id
                 )
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM authority
                 JOIN locked_products ON locked_products.id = authority.product_id
                 JOIN locked_cart ON locked_cart.product_id = authority.product_id
                 WHERE authority.reservation_count <> 1
                    OR locked_products.stock_status <> 'reserved'
                    OR locked_products.reserved_until IS DISTINCT FROM authority.expires_at
                    OR locked_cart.status <> 'payment_pending'
                    OR locked_cart.reserved_until IS DISTINCT FROM authority.expires_at
               )
               AND (SELECT COUNT(*) FROM expected_input) =
                   (SELECT COUNT(*) FROM authority)
               AND NOT EXISTS (
                 SELECT 1
                 FROM expected_input
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM authority
                   WHERE authority.product_id = expected_input.product_id
                 )
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM authority
                 JOIN locked_products ON locked_products.id = authority.product_id
                 JOIN locked_cart ON locked_cart.product_id = authority.product_id
                 JOIN expected_input ON expected_input.product_id = authority.product_id
                 WHERE authority.reservation_count <> 1
                    OR authority.expires_at <> ${reservedUntil}
                    OR locked_products.stock_status <> 'reserved'
                    OR locked_products.reserved_until IS DISTINCT FROM authority.expires_at
                    OR locked_cart.status <> 'payment_pending'
                    OR locked_cart.reserved_until IS DISTINCT FROM authority.expires_at
                    OR locked_cart.reservation_token IS DISTINCT FROM
                       expected_input.payment_reservation_token
                    OR expected_input.cart_deadline IS DISTINCT FROM
                       locked_cart.added_at +
                         (${CART_RESERVATION_MINUTES} * INTERVAL '1 minute')
                    OR expected_input.cart_deadline < authority.expires_at
                    OR expected_input.restoration_reservation_token IS NULL
                    OR expected_input.restoration_reservation_token = ''
               ) AS ok
      ),
      restored_products AS (
        UPDATE products AS product
        SET stock_status = 'reserved',
            reserved_until = expected_input.cart_deadline,
            quantity_available = 1,
            updated_at = statement_timestamp()
        FROM authority, expected_input, guarded
        WHERE guarded.ok
          AND product.id = authority.product_id
          AND expected_input.product_id = authority.product_id
          AND expected_input.cart_deadline > ${now}
          AND product.stock_status = 'reserved'
          AND product.reserved_until = authority.expires_at
        RETURNING product.id, product.slug
      ),
      released_products AS (
        UPDATE products AS product
        SET stock_status = 'available',
            reserved_until = NULL,
            quantity_available = 1,
            updated_at = statement_timestamp()
        FROM authority, expected_input, guarded
        WHERE guarded.ok
          AND product.id = authority.product_id
          AND expected_input.product_id = authority.product_id
          AND expected_input.cart_deadline <= ${now}
          AND product.stock_status = 'reserved'
          AND product.reserved_until = authority.expires_at
        RETURNING product.id, product.slug
      ),
      restored_cart AS (
        UPDATE user_cart_items AS cart
        SET reservation_token = expected_input.restoration_reservation_token,
            reserved_until = expected_input.cart_deadline,
            status = 'active',
            updated_at = ${now}
        FROM authority, expected_input, restored_products
        WHERE cart.user_id = ${userId}::uuid
          AND cart.product_id = restored_products.id
          AND authority.product_id = restored_products.id
          AND expected_input.product_id = restored_products.id
          AND cart.status = 'payment_pending'
          AND cart.reservation_token = expected_input.payment_reservation_token
          AND cart.reserved_until = authority.expires_at
        RETURNING cart.product_id
      ),
      removed_cart AS (
        DELETE FROM user_cart_items AS cart
        USING authority, expected_input, released_products
        WHERE cart.user_id = ${userId}::uuid
          AND cart.product_id = released_products.id
          AND authority.product_id = released_products.id
          AND expected_input.product_id = released_products.id
          AND cart.status = 'payment_pending'
          AND cart.reservation_token = expected_input.payment_reservation_token
          AND cart.reserved_until = authority.expires_at
        RETURNING cart.product_id
      ),
      transitioned AS MATERIALIZED (
        SELECT restored_products.id AS product_id
        FROM restored_products
        JOIN restored_cart ON restored_cart.product_id = restored_products.id
        UNION ALL
        SELECT released_products.id
        FROM released_products
        JOIN removed_cart ON removed_cart.product_id = released_products.id
      ),
      resolved_payment_reservations AS (
        DELETE FROM reservations AS reservation
        USING authority, transitioned
        WHERE reservation.order_id = ${orderId}::uuid
          AND reservation.product_id = transitioned.product_id
          AND authority.product_id = transitioned.product_id
          AND reservation.expires_at = authority.expires_at
        RETURNING reservation.product_id
      ),
      cleanup_counts AS MATERIALIZED (
        SELECT (SELECT COUNT(*) FROM authority) AS expected_count,
               (SELECT COUNT(*) FROM transitioned) AS transitioned_count,
               (SELECT COUNT(*) FROM resolved_payment_reservations) AS reservation_count
      ),
      failed_order AS (
        UPDATE orders AS target
        SET payment_status = 'failed',
            updated_at = ${now}
        FROM locked_order, guarded, cleanup_counts
        WHERE target.id = ${orderId}::uuid
          AND target.user_id = ${userId}::uuid
          AND target.payment_status = 'pending'
          AND guarded.ok
          AND cleanup_counts.transitioned_count = cleanup_counts.expected_count
          AND cleanup_counts.reservation_count = cleanup_counts.expected_count
        RETURNING target.id
      )
      SELECT (SELECT payment_status FROM locked_order) AS previous_payment_status,
             EXISTS (SELECT 1 FROM failed_order) AS failed,
             ARRAY(SELECT released_products.id::text FROM released_products ORDER BY released_products.id) AS released_product_ids,
             ARRAY(SELECT released_products.slug FROM released_products ORDER BY released_products.slug) AS released_slugs,
             ARRAY(SELECT restored_products.id::text FROM restored_products ORDER BY restored_products.id) AS restored_product_ids,
             ARRAY(SELECT restored_products.slug FROM restored_products ORDER BY restored_products.slug) AS restored_slugs
      FROM guarded
    `),
  );

  const row = resultRows(result)[0];
  if (!row) {
    return {
      kind: "ownership_conflict",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    };
  }

  const releasedProductIds = Array.isArray(row.released_product_ids)
    ? row.released_product_ids.map(String)
    : [];
  const releasedSlugs = Array.isArray(row.released_slugs)
    ? row.released_slugs.map(String)
    : [];
  const restoredProductIds = Array.isArray(row.restored_product_ids)
    ? row.restored_product_ids.map(String)
    : [];
  const restoredSlugs = Array.isArray(row.restored_slugs)
    ? row.restored_slugs.map(String)
    : [];
  if (Boolean(row.failed)) {
    return {
      kind: "released",
      releasedProductIds,
      releasedSlugs,
      restoredProductIds,
      restoredSlugs,
    };
  }

  const previousPaymentStatus = String(row.previous_payment_status ?? "");
  if (previousPaymentStatus === "paid") {
    return {
      kind: "already_paid",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    };
  }
  if (previousPaymentStatus === "failed") {
    return {
      kind: "already_failed",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    };
  }
  if (previousPaymentStatus && previousPaymentStatus !== "pending") {
    return {
      kind: "order_state_conflict",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    };
  }
  return {
    kind: "ownership_conflict",
    releasedProductIds: [],
    releasedSlugs: [],
    restoredProductIds: [],
    restoredSlugs: [],
  };
}

export type ExpiredPaymentHoldCandidate = {
  items: Array<{
    cartDeadline: Date;
    paymentReservationToken: string;
    productId: string;
  }>;
  orderId: string;
  productIds: string[];
  providerPaymentId: string | null;
  reservedUntil: Date;
  totalPaise: number;
  userId: string;
};

export type ExpiredPaymentHoldScan = {
  candidates: ExpiredPaymentHoldCandidate[];
  conflictOrderIds: string[];
  protectedProductIds: string[];
};

/**
 * Return expired products that are still attached to a pending payment.
 *
 * This is deliberately read-only. Storefront and cart reads may use the local
 * clock to expire an ordinary cart hold, but a pending payment remains
 * protected until the cron has checked Razorpay's authoritative state.
 */
export async function listExpiredPendingPaymentProductIds({
  now = new Date(),
  productIds,
}: {
  now?: Date;
  productIds: string[];
}): Promise<string[]> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const result = await withRetry(() =>
    db.execute(sql`
      WITH input AS MATERIALIZED (
        SELECT value::uuid AS product_id
        FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      )
      SELECT DISTINCT product.id
      FROM products AS product
      JOIN input ON input.product_id = product.id
      JOIN reservations AS reservation ON reservation.product_id = product.id
      JOIN orders AS payment_order
        ON payment_order.id = reservation.order_id
       AND payment_order.payment_status = 'pending'
      WHERE product.stock_status = 'reserved'
        AND product.reserved_until IS NOT NULL
        AND product.reserved_until <= ${now}
        AND reservation.expires_at = product.reserved_until
    `),
  );

  return resultRows(result).map((row) => String(row.id));
}

/**
 * Inspect a bounded batch of expired pending-payment holds for the protected
 * reconciliation cron. This query never changes an order or inventory.
 *
 * Every reservation belonging to a candidate order is returned, including a
 * product outside the initial input set, so the caller can only act on an
 * exact whole-order authority set. Locally inconsistent orders are surfaced as
 * conflicts and remain protected for manual repair.
 */
export async function listExpiredPaymentHoldCandidates({
  limit = 25,
  now = new Date(),
  productIds,
}: {
  limit?: number;
  now?: Date;
  productIds: string[];
}): Promise<ExpiredPaymentHoldScan> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) {
    return { candidates: [], conflictOrderIds: [], protectedProductIds: [] };
  }
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));

  const candidateResult = await withRetry(() =>
    db.execute(sql`
      WITH input AS MATERIALIZED (
        SELECT value::uuid AS product_id
        FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      ),
      candidate_orders AS MATERIALIZED (
        SELECT reservation.order_id,
               MIN(product.reserved_until) AS oldest_expiry
        FROM reservations AS reservation
        JOIN orders AS payment_order
          ON payment_order.id = reservation.order_id
         AND payment_order.payment_status = 'pending'
         AND payment_order.user_id IS NOT NULL
        JOIN products AS product
          ON product.id = reservation.product_id
         AND product.stock_status = 'reserved'
        JOIN input ON input.product_id = product.id
        WHERE product.reserved_until IS NOT NULL
          AND product.reserved_until <= ${now}
          AND reservation.expires_at = product.reserved_until
        GROUP BY reservation.order_id
        ORDER BY MIN(product.reserved_until), reservation.order_id
        LIMIT ${boundedLimit}
      )
      SELECT reservation.order_id,
             payment_order.user_id,
             payment_order.razorpay_order_id,
             payment_order.total_paise,
             reservation.product_id,
             reservation.expires_at,
             product.stock_status AS product_stock_status,
             product.reserved_until AS product_reserved_until,
             cart.added_at AS cart_added_at,
             cart.reservation_token AS cart_reservation_token,
             cart.status AS cart_status,
             cart.reserved_until AS cart_reserved_until
      FROM candidate_orders
      JOIN orders AS payment_order
        ON payment_order.id = candidate_orders.order_id
       AND payment_order.payment_status = 'pending'
      JOIN reservations AS reservation
        ON reservation.order_id = candidate_orders.order_id
      LEFT JOIN products AS product ON product.id = reservation.product_id
      LEFT JOIN user_cart_items AS cart
        ON cart.user_id = payment_order.user_id
       AND cart.product_id = reservation.product_id
      ORDER BY reservation.order_id, reservation.product_id
    `),
  );

  const rows = resultRows(candidateResult);
  const byOrder = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const orderId = String(row.order_id);
    const group = byOrder.get(orderId) ?? [];
    group.push(row);
    byOrder.set(orderId, group);
  }

  const conflictOrderIds: string[] = [];
  const protectedProductIds = new Set<string>();
  const candidates: ExpiredPaymentHoldCandidate[] = [];

  for (const [orderId, group] of byOrder) {
    group.forEach((row) => protectedProductIds.add(String(row.product_id)));

    const candidate = toPaymentHoldCandidate(orderId, group, now);
    if (candidate) {
      candidates.push(candidate);
    } else {
      conflictOrderIds.push(orderId);
    }
  }

  return {
    candidates,
    conflictOrderIds,
    protectedProductIds: [...protectedProductIds],
  };
}

/**
 * Decide whether one pending order's reservation rows form an exact,
 * whole-order payment authority, or return null for a conflict.
 *
 * `lapsedBy` adds the local-clock condition the scheduled scan needs. A
 * provider event that already reported the link terminal passes null: the
 * provider, not the hold's expiry, decided that attempt is over.
 */
function toPaymentHoldCandidate(
  orderId: string,
  group: Array<Record<string, unknown>>,
  lapsedBy: Date | null,
): ExpiredPaymentHoldCandidate | null {
  const expiryValues = new Set(group.map((row) => String(row.expires_at)));
  const uniqueProductIds = new Set(group.map((row) => String(row.product_id)));
  const userId = group[0]?.user_id ? String(group[0].user_id) : null;
  const totalPaise = Number(group[0]?.total_paise);
  const exact =
    userId != null &&
    Number.isSafeInteger(totalPaise) &&
    totalPaise > 0 &&
    uniqueProductIds.size === group.length &&
    expiryValues.size === 1 &&
    group.every((row) => {
      const expiresAt = new Date(String(row.expires_at));
      const cartAddedAt = row.cart_added_at
        ? new Date(String(row.cart_added_at))
        : null;
      const cartDeadline = cartAddedAt
        ? getCartReservationExpiresAt(cartAddedAt)
        : null;
      const productReservedUntil = row.product_reserved_until
        ? new Date(String(row.product_reserved_until))
        : null;
      const cartReservedUntil = row.cart_reserved_until
        ? new Date(String(row.cart_reserved_until))
        : null;
      return (
        row.product_stock_status === "reserved" &&
        row.cart_status === "payment_pending" &&
        typeof row.cart_reservation_token === "string" &&
        row.cart_reservation_token.length > 0 &&
        (lapsedBy == null || expiresAt <= lapsedBy) &&
        cartDeadline != null &&
        expiresAt <= cartDeadline &&
        productReservedUntil?.getTime() === expiresAt.getTime() &&
        cartReservedUntil?.getTime() === expiresAt.getTime()
      );
    });

  if (!exact || !userId) return null;

  return {
    items: group.map((row) => {
      const addedAt = new Date(String(row.cart_added_at));
      return {
        cartDeadline: getCartReservationExpiresAt(addedAt),
        paymentReservationToken: String(row.cart_reservation_token),
        productId: String(row.product_id),
      };
    }),
    orderId,
    productIds: [...uniqueProductIds],
    providerPaymentId: group[0]?.razorpay_order_id
      ? String(group[0].razorpay_order_id)
      : null,
    reservedUntil: new Date([...expiryValues][0]!),
    totalPaise,
    userId,
  };
}

export type PaymentHoldCandidate = ExpiredPaymentHoldCandidate;

export type PaymentHoldCandidateLookup =
  | { candidate: PaymentHoldCandidate; kind: "candidate" }
  | { kind: "conflict"; protectedProductIds: string[] }
  | { kind: "none" };

/**
 * One pending order's payment authority, for a provider event that has already
 * reported its link terminal. The exactness rules are the scheduled scan's,
 * without its local-clock lapse. Read-only; "none" means the order is not
 * pending or holds no reservation.
 */
export async function getPaymentHoldCandidateForOrder(
  orderId: string,
): Promise<PaymentHoldCandidateLookup> {
  const result = await withRetry(() =>
    db.execute(sql`
      SELECT reservation.order_id,
             payment_order.user_id,
             payment_order.razorpay_order_id,
             payment_order.total_paise,
             reservation.product_id,
             reservation.expires_at,
             product.stock_status AS product_stock_status,
             product.reserved_until AS product_reserved_until,
             cart.added_at AS cart_added_at,
             cart.reservation_token AS cart_reservation_token,
             cart.status AS cart_status,
             cart.reserved_until AS cart_reserved_until
      FROM orders AS payment_order
      JOIN reservations AS reservation
        ON reservation.order_id = payment_order.id
      LEFT JOIN products AS product ON product.id = reservation.product_id
      LEFT JOIN user_cart_items AS cart
        ON cart.user_id = payment_order.user_id
       AND cart.product_id = reservation.product_id
      WHERE payment_order.id = ${orderId}::uuid
        AND payment_order.payment_status = 'pending'
      ORDER BY reservation.product_id
    `),
  );

  const group = resultRows(result);
  if (group.length === 0) return { kind: "none" };

  const candidate = toPaymentHoldCandidate(orderId, group, null);
  return candidate
    ? { candidate, kind: "candidate" }
    : {
        kind: "conflict",
        protectedProductIds: [
          ...new Set(group.map((row) => String(row.product_id))),
        ],
      };
}

/**
 * The shopper's live payment hold for one order, or null.
 *
 * Every reservation of their pending order must still be the exact current
 * hold — product reserved at that expiry, their bag row in payment at that
 * same instant — and still in the future. One stale line means there is no
 * payment window left to hand a link back for.
 */
export async function getLivePaymentHoldForOrder({
  now,
  orderId,
  userId,
}: {
  now: Date;
  orderId: string;
  userId: string;
}): Promise<{ expiresAt: Date; productIds: string[] } | null> {
  const result = await withRetry(() =>
    db.execute(sql`
      SELECT reservation.product_id,
             reservation.expires_at,
             COALESCE(
               product.stock_status = 'reserved'
               AND product.reserved_until = reservation.expires_at
               AND cart.status = 'payment_pending'
               AND cart.reserved_until = reservation.expires_at
               AND reservation.expires_at > ${now}::timestamptz,
               FALSE
             ) AS exact_live_hold
      FROM orders AS payment_order
      JOIN reservations AS reservation
        ON reservation.order_id = payment_order.id
      LEFT JOIN products AS product ON product.id = reservation.product_id
      LEFT JOIN user_cart_items AS cart
        ON cart.user_id = payment_order.user_id
       AND cart.product_id = reservation.product_id
      WHERE payment_order.id = ${orderId}::uuid
        AND payment_order.user_id = ${userId}::uuid
        AND payment_order.payment_status = 'pending'
    `),
  );

  const rows = resultRows(result);
  // Fail closed: anything but a literal true is not proof of a live hold.
  if (rows.length === 0 || !rows.every((row) => row.exact_live_hold === true)) {
    return null;
  }

  const expiries = rows.map((row) => new Date(String(row.expires_at)).getTime());
  return {
    expiresAt: new Date(Math.min(...expiries)),
    productIds: [...new Set(rows.map((row) => String(row.product_id)))],
  };
}

/** A request asks the provider about at most this many stalled payments. */
const LAPSED_OWN_PAYMENT_ORDER_LIMIT = 3;

/**
 * This shopper's own payment holds whose time has passed unresolved, as
 * distinct order ids, oldest hold first.
 *
 * Only the exact current payment hold counts: their pending order reserving
 * the piece at its expiry, the product still reserved at that instant, and
 * their bag line in payment at that same instant. The caller asks Razorpay
 * about each one, so the list is short. `productIds` narrows it to the pieces
 * a request is about. Read-only.
 */
export async function listLapsedOwnPaymentOrderIds({
  now,
  productIds,
  userId,
}: {
  now: Date;
  productIds?: string[];
  userId: string;
}): Promise<string[]> {
  const ids = productIds ? [...new Set(productIds)].filter(Boolean) : null;
  if (ids?.length === 0) return [];

  const result = await withRetry(() =>
    db.execute(sql`
      SELECT reservation.order_id
      FROM reservations AS reservation
      JOIN orders AS payment_order
        ON payment_order.id = reservation.order_id
       AND payment_order.user_id = ${userId}::uuid
       AND payment_order.payment_status = 'pending'
      JOIN products AS product
        ON product.id = reservation.product_id
       AND product.stock_status = 'reserved'
       AND product.reserved_until = reservation.expires_at
      JOIN user_cart_items AS cart
        ON cart.user_id = payment_order.user_id
       AND cart.product_id = reservation.product_id
       AND cart.status = 'payment_pending'
       AND cart.reserved_until = product.reserved_until
      WHERE reservation.expires_at <= ${now}::timestamptz
      ${
        ids
          ? sql`AND reservation.product_id IN (
              SELECT value::uuid
              FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
            )`
          : sql.empty()
      }
      GROUP BY reservation.order_id
      ORDER BY MIN(reservation.expires_at), reservation.order_id
      LIMIT ${LAPSED_OWN_PAYMENT_ORDER_LIMIT}
    `),
  );

  return resultRows(result).map((row) => String(row.order_id));
}

export type CommerceExpiryResult = {
  blockedProductIds: string[];
  conflictOrderIds: string[];
  ordinaryReleasedProductIds: string[];
  paymentReleasedOrderIds: string[];
  paymentReleasedProductIds: string[];
  paymentReleasedSlugs: string[];
  protectedProductIds: string[];
  releasedProductIds: string[];
};

/**
 * The only public expiry orchestration path.
 *
 * This path is safe for ordinary cart/product requests: it only releases
 * ordinary cart holds. Pending-payment products are reported as blocked and
 * are never released here from the local clock alone. Provider reconciliation
 * lives exclusively in the protected cron.
 */
export async function expireCommerceHoldsForProducts(
  productIds: string[],
  now = new Date(),
): Promise<CommerceExpiryResult> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) {
    return {
      blockedProductIds: [],
      conflictOrderIds: [],
      ordinaryReleasedProductIds: [],
      paymentReleasedOrderIds: [],
      paymentReleasedProductIds: [],
      paymentReleasedSlugs: [],
      protectedProductIds: [],
      releasedProductIds: [],
    };
  }

  const protectedProductIds = await listExpiredPendingPaymentProductIds({
    now,
    productIds: ids,
  });
  const protectedSet = new Set(protectedProductIds);
  const ordinaryReleasedProductIds = await expireHoldsForProducts(
    ids.filter((productId) => !protectedSet.has(productId)),
    now,
  );

  return {
    blockedProductIds: protectedProductIds,
    conflictOrderIds: [],
    ordinaryReleasedProductIds,
    paymentReleasedOrderIds: [],
    paymentReleasedProductIds: [],
    paymentReleasedSlugs: [],
    protectedProductIds,
    releasedProductIds: ordinaryReleasedProductIds,
  };
}

export type CompletePaidCommerceResult = {
  kind:
    | "already_paid"
    | "completed"
    | "inventory_conflict"
    | "order_state_conflict"
    | "payment_conflict";
  soldCount: number;
  soldSlugs: string[];
};

/**
 * Commit payment, one-of-one inventory, the account bag and order reservations
 * together. No authoritative mutation escapes this statement on a failed
 * guard, and an already-paid callback is read-only. Any other account's line
 * for a piece that just sold goes in the same commit, so Sold never lingers in
 * a second bag.
 */
export async function completePaidCommerceState({
  orderId,
  paidAt,
  paymentId,
  paymentMethod,
  updatedAt = new Date(),
  userId,
}: {
  orderId: string;
  paidAt: Date;
  paymentId: string;
  paymentMethod: string;
  updatedAt?: Date;
  userId: string | null;
}): Promise<CompletePaidCommerceResult> {
  const result = await withRetry(() =>
    db.execute(sql`
      WITH locked_order AS MATERIALIZED (
        SELECT orders.id,
               orders.payment_id,
               orders.payment_status,
               orders.placed_at,
               orders.user_id
        FROM orders
        WHERE orders.id = ${orderId}::uuid
          AND orders.user_id IS NOT DISTINCT FROM ${userId}::uuid
        FOR UPDATE OF orders
      ),
      all_items AS MATERIALIZED (
        SELECT DISTINCT item.product_id
        FROM order_items AS item
        JOIN locked_order ON locked_order.id = item.order_id
        WHERE item.product_id IS NOT NULL
      ),
      classification_snapshot AS MATERIALIZED (
        SELECT event.payload -> 'reservableProductIds' AS product_ids
        FROM order_events AS event
        JOIN locked_order ON locked_order.id = event.order_id
        WHERE jsonb_typeof(event.payload -> 'reservableProductIds') = 'array'
        ORDER BY event.created_at ASC
        LIMIT 1
      ),
      classified_items AS MATERIALIZED (
        SELECT value::uuid AS product_id
        FROM classification_snapshot,
             jsonb_array_elements_text(classification_snapshot.product_ids)
      ),
      reservable_items AS MATERIALIZED (
        SELECT classified_items.product_id
        FROM classified_items
        UNION
        SELECT DISTINCT reservation.product_id
        FROM reservations AS reservation
        JOIN locked_order ON locked_order.id = reservation.order_id
        JOIN all_items ON all_items.product_id = reservation.product_id
        WHERE NOT EXISTS (SELECT 1 FROM classification_snapshot)
      ),
      locked_products AS MATERIALIZED (
        SELECT product.id,
               product.reserved_until,
               product.slug,
               product.stock_status
        FROM products AS product
        JOIN reservable_items ON reservable_items.product_id = product.id
        ORDER BY product.id
        FOR UPDATE OF product
      ),
      inventory_guard AS MATERIALIZED (
        SELECT (
                 EXISTS (SELECT 1 FROM classification_snapshot)
                 OR EXISTS (SELECT 1 FROM reservable_items)
               )
               AND COUNT(*) = (SELECT COUNT(*) FROM reservable_items)
               AND (
                 SELECT COUNT(*)
                 FROM reservations
                 WHERE reservations.order_id = ${orderId}::uuid
               ) = (SELECT COUNT(*) FROM reservable_items)
               AND NOT EXISTS (
                 SELECT 1
                 FROM reservable_items
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM all_items
                   WHERE all_items.product_id = reservable_items.product_id
                 )
               )
               AND (
                 COUNT(*) = 0
                 OR COALESCE(
                   BOOL_AND(
                     locked_products.stock_status = 'reserved'
                     AND locked_products.reserved_until IS NOT NULL
                     AND EXISTS (
                       SELECT 1
                       FROM reservations
                       WHERE reservations.order_id = ${orderId}::uuid
                         AND reservations.product_id = locked_products.id
                         AND reservations.expires_at =
                           locked_products.reserved_until
                     )
                   ),
                   FALSE
                 )
               ) AS ok
        FROM locked_products
      ),
      paid_order AS (
        UPDATE orders AS target
        SET paid_at = ${paidAt},
            payment_id = ${paymentId},
            payment_method = ${paymentMethod},
            payment_status = 'paid',
            status = 'confirmed',
            updated_at = ${updatedAt}
        FROM locked_order, inventory_guard
        WHERE target.id = locked_order.id
          AND inventory_guard.ok
          AND locked_order.payment_status = 'pending'
          AND (
            locked_order.payment_id IS NULL
            OR locked_order.payment_id = ${paymentId}
          )
        RETURNING target.id
      ),
      sold AS (
        UPDATE products AS product
        SET reserved_until = NULL,
            sold_at = ${paidAt},
            stock_status = 'sold',
            quantity_available = 0,
            updated_at = statement_timestamp()
        FROM locked_products, paid_order
        WHERE product.id = locked_products.id
        RETURNING product.id, product.slug
      ),
      deleted_cart AS (
        DELETE FROM user_cart_items AS cart
        USING all_items, locked_order, paid_order
        WHERE cart.user_id = locked_order.user_id
          AND cart.product_id = all_items.product_id
          AND (
            EXISTS (
              SELECT 1
              FROM reservable_items
              WHERE reservable_items.product_id = cart.product_id
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM reservable_items
                WHERE reservable_items.product_id = cart.product_id
              )
              AND cart.reserved_until IS NULL
              AND cart.status = 'active'
              AND cart.updated_at <= locked_order.placed_at
            )
          )
        RETURNING cart.product_id
      ),
      displaced_cart AS (
        DELETE FROM user_cart_items AS cart
        USING sold
        WHERE cart.product_id = sold.id
          AND cart.user_id IS DISTINCT FROM (SELECT user_id FROM locked_order)
        RETURNING cart.product_id
      ),
      cart_cleanup AS MATERIALIZED (
        SELECT COUNT(*) AS removed_count FROM deleted_cart
      ),
      deleted_reservations AS (
        DELETE FROM reservations
        USING paid_order, cart_cleanup
        WHERE reservations.order_id = paid_order.id
        RETURNING reservations.product_id
      )
      SELECT locked_order.payment_id AS previous_payment_id,
             locked_order.payment_status AS previous_payment_status,
             inventory_guard.ok AS inventory_ok,
             EXISTS (SELECT 1 FROM paid_order) AS completed,
             (SELECT COUNT(*) FROM sold) AS sold_count,
             ARRAY(SELECT sold.slug FROM sold ORDER BY sold.slug) AS sold_slugs
      FROM locked_order, inventory_guard
    `),
  );

  const row = resultRows(result)[0];
  if (!row) {
    return { kind: "inventory_conflict", soldCount: 0, soldSlugs: [] };
  }

  const soldSlugs = Array.isArray(row.sold_slugs)
    ? row.sold_slugs.map(String)
    : [];
  const soldCount = Number(row.sold_count ?? 0);
  if (Boolean(row.completed)) {
    return { kind: "completed", soldCount, soldSlugs };
  }
  if (String(row.previous_payment_status) === "paid") {
    return {
      kind:
        row.previous_payment_id == null ||
        String(row.previous_payment_id) === paymentId
          ? "already_paid"
          : "payment_conflict",
      soldCount,
      soldSlugs,
    };
  }
  if (
    row.previous_payment_id != null &&
    String(row.previous_payment_id) !== paymentId
  ) {
    return { kind: "payment_conflict", soldCount, soldSlugs };
  }
  if (String(row.previous_payment_status) !== "pending") {
    return { kind: "order_state_conflict", soldCount, soldSlugs };
  }
  return { kind: "inventory_conflict", soldCount, soldSlugs };
}

export type ViewerStateRow = {
  cartReservationToken: null | string;
  cartReservedUntil: Date | null;
  cartStatus: null | string;
  hasPendingPayment: boolean;
  madeToOrderInBag: boolean;
  productId: string;
  reservedUntil: Date | null;
  stockStatus: string;
};

/**
 * Everything needed to decide what each of these sarees should offer this
 * shopper, in one round trip.
 *
 * A collection page shows dozens of pieces; asking per card turned one page
 * view into dozens of queries. The bag row and the pending-payment flag are
 * left-joined so a signed-out viewer simply gets nulls and the public state.
 * Only published pieces answer: an id with no row has no verdict to give.
 */
export async function getViewerStateRows(
  productIds: string[],
  userId: null | string,
): Promise<ViewerStateRow[]> {
  const ids = [...new Set(productIds)].filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const rows = await withRetry(() =>
    db
      .select({
        cartReservationToken: userCartItems.reservationToken,
        cartReservedUntil: userCartItems.reservedUntil,
        cartStatus: userCartItems.status,
        productId: products.id,
        reservedUntil: products.reservedUntil,
        stockStatus: products.stockStatus,
        typeSlug: productTypes.slug,
      })
      .from(products)
      .leftJoin(productTypes, eq(productTypes.id, products.typeId))
      .leftJoin(
        userCartItems,
        userId
          ? and(
              eq(userCartItems.productId, products.id),
              eq(userCartItems.userId, userId),
              inArray(userCartItems.status, LIVE_CART_STATUSES),
            )
          : sql`false`,
      )
      .where(and(inArray(products.id, ids), eq(products.status, "published"))),
  );

  /*
   * A made-to-order blouse line never has a hold to compare against, so the
   * line itself is the verdict. Only a hold-free active line counts: that is
   * the only shape the add path writes for one.
   */
  const toViewerStateRow = (
    { typeSlug, ...row }: (typeof rows)[number],
    pendingIds: ReadonlySet<string>,
  ): ViewerStateRow => ({
    ...row,
    hasPendingPayment: pendingIds.has(row.productId),
    madeToOrderInBag:
      row.cartStatus === "active" &&
      row.cartReservedUntil == null &&
      row.cartReservationToken == null &&
      isBlouseProduct({ typeSlug }),
  });

  if (!userId) {
    return rows.map((row) => toViewerStateRow(row, new Set()));
  }

  /*
   * One extra query for the whole page rather than one per product. Only the
   * exact current payment hold counts: this shopper's pending order at the
   * product's expiry, the product still reserved, and their own bag row in
   * payment at that same instant. There is deliberately no clock bound — when
   * the protected sweep reports the order still owns the row, it stays theirs
   * until provider-aware reconciliation resolves it.
   */
  const pending = await withRetry(() =>
    db
      .selectDistinct({ productId: reservations.productId })
      .from(reservations)
      .innerJoin(orders, eq(orders.id, reservations.orderId))
      .innerJoin(products, eq(products.id, reservations.productId))
      .innerJoin(
        userCartItems,
        and(
          eq(userCartItems.userId, userId),
          eq(userCartItems.productId, reservations.productId),
          eq(userCartItems.status, "payment_pending"),
          eq(userCartItems.reservedUntil, products.reservedUntil),
        ),
      )
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.paymentStatus, "pending"),
          inArray(reservations.productId, ids),
          eq(products.stockStatus, "reserved"),
          eq(reservations.expiresAt, products.reservedUntil),
        ),
      ),
  );
  const pendingIds = new Set(
    pending.map((row) => row.productId).filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => toViewerStateRow(row, pendingIds));
}

export type UserCartLine = UserCartItemRow & {
  detailsFabric: null | string;
  imageAlt: null | string;
  imageUrl: null | string;
  name: string;
  originalPricePaise: null | number;
  pricePaise: number;
  slug: string;
};

/**
 * One customer's bag, with everything the drawer needs to draw it.
 *
 * The bag lives on the server now, but the drawer, the header count and the
 * add animation all read the client store. Returning the display fields here
 * lets that store be a faithful mirror of the server, so none of those
 * surfaces had to change.
 */
export async function listUserCartLines(
  userId: string,
): Promise<UserCartLine[]> {
  return withRetry(() =>
    db
      .select({
        addedAt: userCartItems.addedAt,
        detailsFabric: products.detailsFabric,
        /*
         * The bag's thumbnail, resolved here rather than left to the client.
         *
         * A line synced down from the account had no image at all: the drawer
         * only ever got one from the card that added it, so a bag opened on a
         * second device — or after a refresh that cleared the local row — drew
         * an empty beige box beside every piece. The lowest sort_order image
         * is the same one the card shows, and the index on
         * (product_id, sort_order) makes this a lookup, not a scan.
         */
        imageAlt: sql<null | string>`(
          SELECT ma.alt
          FROM product_images pi
          JOIN media_assets ma ON ma.id = pi.media_id
          WHERE pi.product_id = ${userCartItems.productId}
          ORDER BY pi.sort_order ASC, pi.created_at ASC
          LIMIT 1
        )`,
        imageUrl: sql<null | string>`(
          SELECT ma.url
          FROM product_images pi
          JOIN media_assets ma ON ma.id = pi.media_id
          WHERE pi.product_id = ${userCartItems.productId}
          ORDER BY pi.sort_order ASC, pi.created_at ASC
          LIMIT 1
        )`,
        name: products.name,
        originalPricePaise: products.originalPricePaise,
        pricePaise: products.pricePaise,
        productId: userCartItems.productId,
        reservationToken: userCartItems.reservationToken,
        reservedUntil: userCartItems.reservedUntil,
        selectedOptions: userCartItems.selectedOptions,
        slug: products.slug,
        status: userCartItems.status,
      })
      .from(userCartItems)
      .innerJoin(products, eq(products.id, userCartItems.productId))
      .where(
        and(
          eq(userCartItems.userId, userId),
          inArray(userCartItems.status, LIVE_CART_STATUSES),
        ),
      ),
  );
}
