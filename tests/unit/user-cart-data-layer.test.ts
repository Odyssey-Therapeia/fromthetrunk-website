/**
 * The authenticated bag's data layer.
 *
 * The property that matters most here is inseparability: a saree marked
 * reserved with no bag row behind it is a piece nobody can buy and nobody can
 * release, stuck until the expiry sweep finds it.
 *
 * Every statement is rendered through drizzle's PgDialect, so assertions read
 * the SQL that would actually be sent, together with its bound parameters.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAYMENT_LINK_HOLD_MINUTES } from "@/lib/cart/reservation-policy";

const database = vi.hoisted(() => ({
  queries: [] as unknown[],
  results: [] as unknown[],
}));

vi.mock("@/db", async () => {
  const { QueryBuilder } = await import("drizzle-orm/pg-core");
  const builder = new QueryBuilder();
  return {
    db: {
      execute: (query: unknown) => query,
      select: builder.select.bind(builder),
      selectDistinct: builder.selectDistinct.bind(builder),
    },
    // Every statement passes through here exactly once, so it is both the
    // capture point and where a test decides what the database answered.
    withRetry: async (operation: () => unknown) => {
      database.queries.push(operation());
      return database.results.shift() ?? { rows: [] };
    },
  };
});

const {
  claimProductIntoCart,
  completePaidCommerceState,
  expireCommerceHoldsForProducts,
  expireHoldsForProducts,
  getLivePaymentHoldForOrder,
  getPaymentHoldCandidateForOrder,
  getViewerStateRows,
  listExpiredPaymentHoldCandidates,
  listLapsedOwnPaymentOrderIds,
  pruneUnownedCartRows,
  releaseCartHoldByToken,
  releasePaymentCartItems,
  removeOwnedCartItem,
  startPaymentForOwnedCartItems,
} = await import("@/db/queries/user-cart");

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const OTHER_PRODUCT = "44444444-4444-4444-8444-444444444444";
const THIRD_PRODUCT = "55555555-5555-4555-8555-555555555555";
const FOURTH_PRODUCT = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-09-08T13:01:00.000Z");
const HOLD = new Date("2026-09-08T13:30:00.000Z");

type RenderedQuery = { params: unknown[]; sql: string };

const dialect = new PgDialect();
const rendered = (index = 0): RenderedQuery =>
  dialect.sqlToQuery((database.queries[index] as SQLWrapper).getSQL());

const answer = (...results: unknown[]) => {
  database.results.push(...results);
};

/** The bound value that directly follows `fragment` in the rendered SQL. */
const paramAfter = (query: RenderedQuery, fragment: string) => {
  const at = query.sql.indexOf(fragment);
  if (at < 0) throw new Error(`Missing SQL fragment: ${fragment}`);
  const match = /^\s*\$(\d+)/.exec(query.sql.slice(at + fragment.length));
  if (!match) throw new Error(`No bound value after: ${fragment}`);
  return query.params[Number(match[1]) - 1];
};

/** One CTE's text, from its name up to the next named section. */
const section = (sqlText: string, from: string, to: string) => {
  const start = sqlText.indexOf(from);
  const end = sqlText.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing section ${from} → ${to}`);
  return sqlText.slice(start, end);
};

/** Values bound inside one rendered section, in order. */
const boundIn = (query: RenderedQuery, text: string) =>
  [...text.matchAll(/\$(\d+)/g)].map(([, index]) => query.params[Number(index) - 1]);

/** Rendered SQL with its whitespace collapsed, for whole-clause assertions. */
const flat = (text: string) => text.replace(/\s+/g, " ");

beforeEach(() => {
  database.queries.length = 0;
  database.results.length = 0;
});

describe("atomic claim into the bag", () => {
  it("returns the hold when the claim wins", async () => {
    const reservedUntil = new Date("2026-09-08T13:00:00.000Z");
    answer({
      rows: [{ reserved_until: reservedUntil.toISOString(), slug: "rose-silk" }],
    });

    const claimed = await claimProductIntoCart({
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil,
      userId: USER,
    });

    expect(claimed).toEqual({ reservedUntil, slug: "rose-silk" });
    expect(database.queries).toHaveLength(1);
  });

  it("returns null when another shopper already holds it", async () => {
    const claimed = await claimProductIntoCart({
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil: new Date(),
      userId: USER,
    });

    expect(claimed).toBeNull();
  });

  it("claims the product and saves the row in ONE statement", async () => {
    // Two statements could leave a saree reserved with no bag row behind it —
    // unbuyable and unreleasable until the sweep catches it.
    await claimProductIntoCart({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil: HOLD,
      userId: USER,
    });

    expect(database.queries).toHaveLength(1);
    const query = rendered();
    const claim = section(query.sql, "WITH claimed AS", "saved AS");
    expect(claim).toContain("UPDATE products");
    expect(claim).toContain("stock_status = 'available'");
    expect(paramAfter(query, "stock_status = 'reserved' AND reserved_until <= ")).toEqual(
      NOW,
    );
    // No claim while an exact pending payment still holds the piece.
    expect(claim).toContain("payment_order.payment_status = 'pending'");
    expect(claim).toContain("payment_reservation.expires_at = products.reserved_until");
    // The insert reads FROM the claim, so no claim means no row.
    expect(section(query.sql, "saved AS", "displaced AS")).toContain("FROM claimed");
  });

  it("drops another account's leftover line in the statement that claims the saree", async () => {
    await claimProductIntoCart({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil: HOLD,
      userId: USER,
    });

    const query = rendered();
    const displaced = section(query.sql, "displaced AS", "SELECT claimed.slug");
    expect(displaced).toContain("DELETE FROM user_cart_items AS other");
    expect(displaced).toContain("USING claimed");
    expect(displaced).toContain("other.product_id = claimed.id");
    expect(displaced).toContain("other.status = 'active'");
    expect(paramAfter(query, "other.user_id <> ")).toBe(USER);
  });

  it("keeps the inventory predicate exactly as the rest of the system has it", () => {
    const cartQueries = source("db/queries/user-cart.ts");
    // Nothing here may widen the claim to an approximate match.
    expect(cartQueries).not.toMatch(/reserved_until\s*[<>]\s*.*1000/);
  });
});

describe("lazy expiry", () => {
  it("frees only holds that have actually lapsed", async () => {
    answer({ rows: [{ id: PRODUCT }] });

    const freed = await expireHoldsForProducts([PRODUCT]);

    expect(freed).toEqual([PRODUCT]);
  });

  it("releases product and exact matching bag rows in one statement", async () => {
    answer({ rows: [{ id: PRODUCT }] });

    await expireHoldsForProducts([PRODUCT]);

    expect(database.queries).toHaveLength(1);
    const statement = rendered().sql;
    expect(statement).toContain("UPDATE products AS product");
    expect(statement).toContain("DELETE FROM user_cart_items AS cart");
    expect(statement).toContain("cart.reserved_until = expired.expired_until");
    expect(statement).toContain("payment_order.payment_status = 'pending'");
  });

  it("touches nothing when no hold lapsed", async () => {
    const freed = await expireHoldsForProducts([PRODUCT]);

    expect(freed).toEqual([]);
  });

  it("does no work for an empty request", async () => {
    expect(await expireHoldsForProducts([])).toEqual([]);
    expect(database.queries).toHaveLength(0);
  });

  it("deduplicates ids rather than repeating them", async () => {
    await expireHoldsForProducts([PRODUCT, PRODUCT, PRODUCT]);

    expect(rendered().params[0]).toBe(JSON.stringify([PRODUCT]));
  });

  it("keeps pending-payment products blocked during ordinary request expiry", async () => {
    answer({ rows: [{ id: PRODUCT }] });

    const result = await expireCommerceHoldsForProducts([PRODUCT], NOW);

    expect(result).toMatchObject({
      blockedProductIds: [PRODUCT],
      ordinaryReleasedProductIds: [],
      paymentReleasedOrderIds: [],
      paymentReleasedProductIds: [],
      releasedProductIds: [],
    });
    expect(database.queries).toHaveLength(1);
  });
});

describe("removal ownership", () => {
  const removalRow = (overrides: Record<string, unknown> = {}) => ({
    cart_reserved_until: HOLD.toISOString(),
    payment_hold_active: false,
    payment_protected: false,
    product_reserved_until: HOLD.toISOString(),
    product_stock_status: "reserved",
    released: false,
    removed: false,
    slug: "rose-silk",
    ...overrides,
  });

  const removeLine = () =>
    removeOwnedCartItem({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "verified-token",
      reservedUntil: HOLD,
      userId: USER,
    });

  it("lets only the exact current payment hold protect a line, with no clock bound", async () => {
    await removeLine();

    const query = rendered();
    expect(query.sql).not.toContain("pending_order");
    const hold = section(query.sql, "payment_hold AS", "released AS");
    for (const predicate of [
      "orders.payment_status = 'pending'",
      "reservations.expires_at = locked.product_reserved_until",
      "locked.product_stock_status = 'reserved'",
      "locked.cart_status = 'payment_pending'",
      "locked.cart_reserved_until = locked.product_reserved_until",
    ]) {
      expect(hold).toContain(predicate);
    }
    // Same user, same product — and nothing else bound, so no local clock: a
    // lapsed link stays protected until provider-aware reconciliation.
    expect(paramAfter(query, "orders.user_id = ")).toBe(USER);
    expect(paramAfter(query, "reservations.product_id = ")).toBe(PRODUCT);
    expect(boundIn(query, hold)).toEqual([USER, PRODUCT]);
  });

  it("guards both the release and the row delete with that one hold", async () => {
    await removeLine();

    const query = rendered();
    expect(section(query.sql, "released AS", "removed AS")).toContain(
      "payment_hold.active = FALSE",
    );
    expect(
      section(query.sql, "removed AS", "SELECT locked.cart_reserved_until"),
    ).toContain("payment_hold.active = FALSE");
  });

  it("never frees a piece any pending order still reserves at its expiry, whoever placed it", async () => {
    await removeLine();

    const query = rendered();
    const protection = section(query.sql, "payment_protection AS", "payment_hold AS");
    expect(protection).toContain("protecting_order.payment_status = 'pending'");
    expect(protection).toContain(
      "protecting_reservation.expires_at = locked.product_reserved_until",
    );
    // Only the piece is bound — no buyer, no bag line, no clock — so a
    // foreign or historical pending order protects the inventory all the same.
    expect(boundIn(query, protection)).toEqual([PRODUCT]);
    expect(protection).not.toContain("user_id");
    expect(protection).not.toContain("cart_");
    expect(section(query.sql, "released AS", "removed AS")).toContain(
      "payment_protection.active = FALSE",
    );
  });

  it("still drops the line that protection kept from releasing, even an exact one", async () => {
    await removeLine();

    const removed = flat(
      section(rendered().sql, "removed AS", "SELECT locked.cart_reserved_until"),
    );
    // Outside this shopper's own payment, protection alone lets the line go;
    // the exact-match exception only keeps a line nothing protects.
    expect(removed).toContain(
      "payment_hold.active = FALSE AND ( payment_protection.active = TRUE OR NOT ( " +
        "locked.product_stock_status = 'reserved' AND locked.cart_reserved_until IS NOT NULL " +
        "AND locked.product_reserved_until = locked.cart_reserved_until ) )",
    );
    expect(flat(rendered().sql)).toContain(
      "payment_protection.active AS payment_protected",
    );
  });

  it("frees the product and deletes the line in the same statement, on exact proof", async () => {
    await removeLine();

    expect(database.queries).toHaveLength(1);
    const query = rendered();
    const released = section(query.sql, "released AS", "removed AS");
    expect(released).toContain("UPDATE products AS product");
    expect(released).toContain("SET stock_status = 'available'");
    expect(released).toContain("reserved_until = NULL");
    expect(released).toContain("product.reserved_until = locked.cart_reserved_until");
    const releasedQuery = { params: query.params, sql: released };
    expect(paramAfter(releasedQuery, "locked.cart_reservation_token = ")).toBe(
      "verified-token",
    );
    expect(paramAfter(releasedQuery, "locked.cart_reserved_until = ")).toEqual(HOLD);
    expect(query.sql).toContain("DELETE FROM user_cart_items AS cart");
  });

  it("keeps a lapsed, unreconciled payment line as a payment in progress", async () => {
    const lapsed = "2026-09-08T12:55:00.000Z";
    answer({
      rows: [
        removalRow({
          cart_reserved_until: lapsed,
          payment_hold_active: true,
          payment_protected: true,
          product_reserved_until: lapsed,
        }),
      ],
    });

    expect(await removeLine()).toMatchObject({
      paymentHoldActive: true,
      reason: "PAYMENT_IN_PROGRESS",
      released: false,
      removed: false,
      viewerState: "payment_pending",
    });
  });

  it("drops a line that owns nothing, even beside a stale pending order", async () => {
    answer({
      rows: [
        removalRow({
          cart_reserved_until: "2026-09-08T12:00:00.000Z",
          payment_protected: true,
          removed: true,
        }),
      ],
    });

    expect(await removeLine()).toMatchObject({
      paymentHoldActive: false,
      paymentProtected: true,
      reason: "STALE_ROW",
      released: false,
      removed: true,
    });
  });

  it("removes an exact line beside a pending order that is not this shopper's payment, keeping the piece held", async () => {
    const lapsed = "2026-09-08T12:55:00.000Z";
    answer({
      rows: [
        removalRow({
          cart_reserved_until: lapsed,
          payment_protected: true,
          product_reserved_until: lapsed,
          removed: true,
        }),
      ],
    });

    expect(await removeLine()).toMatchObject({
      exactReservationMatch: true,
      paymentHoldActive: false,
      paymentProtected: true,
      reason: "REMOVED_PAYMENT_PROTECTED",
      released: false,
      removed: true,
      // Past its time but still protected, so it is never offered back.
      viewerState: "reserved_by_other",
    });
  });

  it("still releases an exact hold no pending order protects", async () => {
    answer({ rows: [removalRow({ released: true, removed: true })] });

    expect(await removeLine()).toMatchObject({
      paymentProtected: false,
      reason: "RELEASED",
      released: true,
      removed: true,
      viewerState: "available",
    });
  });

  it("calls an unprotected miss RELEASE_MISSED, never a payment", async () => {
    answer({ rows: [removalRow()] });

    expect(await removeLine()).toMatchObject({
      reason: "RELEASE_MISSED",
      removed: false,
      viewerState: "reserved_by_other",
    });
  });

  it("returns null when the line was already gone", async () => {
    expect(await removeLine()).toBeNull();
  });
});

describe("pruning bag lines that own nothing", () => {
  const prune = () => pruneUnownedCartRows({ now: NOW, userId: USER });
  const deletion = () => {
    const statement = flat(rendered().sql);
    return statement.slice(statement.indexOf("DELETE FROM user_cart_items AS cart"));
  };
  const purchasableBranch = () =>
    section(deletion(), "NOT EXISTS ( SELECT 1 FROM locked_products AS purchasable", ") OR (");
  const holdBranch = () =>
    section(deletion(), ") OR ( cart.status = 'active'", "RETURNING");

  it("deletes in one statement, scoped to this shopper, and returns what it dropped", async () => {
    answer({ rows: [{ product_id: PRODUCT }, { product_id: OTHER_PRODUCT }] });

    expect(await prune()).toEqual([PRODUCT, OTHER_PRODUCT]);
    expect(database.queries).toHaveLength(1);
    const query = rendered();
    expect(query.sql).toContain("RETURNING cart.product_id");
    // Both reads of the bag are this shopper's; the only other value is the clock.
    expect(query.params).toEqual([USER, USER, NOW]);
  });

  it("never touches a line in payment", async () => {
    await prune();

    // Outside every pruning branch, so no branch can reach one.
    expect(deletion()).toMatch(
      /^DELETE FROM user_cart_items AS cart WHERE cart\.user_id = \$\d+::uuid AND cart\.status <> 'payment_pending' AND \(/,
    );
    expect(section(flat(rendered().sql), "owned AS", "locked_products AS")).toContain(
      "cart.status <> 'payment_pending'",
    );
  });

  it("keeps a hold-free made-to-order line while its piece can still be bought", async () => {
    await prune();

    // A line with no hold can only be dropped when its piece is not buyable,
    // because the hold branch needs an active line that carries a hold.
    expect(purchasableBranch()).toContain("purchasable.status = 'published'");
    expect(purchasableBranch()).toContain("purchasable.stock_status <> 'sold'");
    expect(holdBranch()).toContain("cart.reserved_until IS NOT NULL");
  });

  it.each([
    ["sold", "purchasable.stock_status <> 'sold'"],
    ["unpublished", "purchasable.status = 'published'"],
    ["missing", "WHERE purchasable.id = cart.product_id"],
  ])("drops a line whose piece is %s", async (_label, predicate) => {
    await prune();

    expect(purchasableBranch()).toContain(predicate);
  });

  it.each([
    ["was released", "holding.stock_status = 'reserved'"],
    ["went to someone else", "holding.reserved_until = cart.reserved_until"],
    ["lapsed", "holding.reserved_until > $"],
  ])("drops an ordinary line whose exact hold %s", async (_label, predicate) => {
    await prune();

    expect(holdBranch()).toContain("NOT EXISTS ( SELECT 1 FROM locked_products AS holding");
    expect(holdBranch()).toContain(predicate);
  });

  it("measures a lapsed hold against the request's clock", async () => {
    await prune();

    const query = rendered();
    expect(paramAfter({ params: query.params, sql: holdBranch() }, "holding.reserved_until > ")).toEqual(NOW);
  });

  it("locks the pieces before their lines, as the claim does, and compares only locked rows", async () => {
    await prune();

    const lock = section(flat(rendered().sql), "locked_products AS", "DELETE FROM");
    expect(lock).toContain("JOIN owned ON owned.product_id = product.id");
    expect(lock).toContain("FOR UPDATE OF product");
    expect(deletion()).not.toContain("FROM products");
  });
});

describe("this shopper's lapsed payment holds", () => {
  const LATER_ORDER = "77777777-7777-4777-8777-777777777777";

  it("lists only exact current payment holds past their time, oldest first and at most three", async () => {
    answer({ rows: [{ order_id: ORDER }, { order_id: LATER_ORDER }] });

    expect(await listLapsedOwnPaymentOrderIds({ now: NOW, userId: USER })).toEqual([
      ORDER,
      LATER_ORDER,
    ]);
    expect(database.queries).toHaveLength(1);
    const query = rendered();
    const statement = flat(query.sql);
    for (const predicate of [
      "payment_order.payment_status = 'pending'",
      "product.stock_status = 'reserved'",
      "product.reserved_until = reservation.expires_at",
      "cart.user_id = payment_order.user_id",
      "cart.product_id = reservation.product_id",
      "cart.status = 'payment_pending'",
      "cart.reserved_until = product.reserved_until",
      "GROUP BY reservation.order_id",
      "ORDER BY MIN(reservation.expires_at), reservation.order_id",
    ]) {
      expect(statement).toContain(predicate);
    }
    expect(paramAfter(query, "payment_order.user_id = ")).toBe(USER);
    expect(paramAfter(query, "reservation.expires_at <= ")).toEqual(NOW);
    expect(paramAfter(query, "LIMIT ")).toBe(3);
    expect(statement).not.toMatch(/UPDATE|DELETE|INSERT/);
    expect(statement).not.toContain("jsonb_array_elements_text");
  });

  it("narrows to the pieces a request is about", async () => {
    await listLapsedOwnPaymentOrderIds({
      now: NOW,
      productIds: [PRODUCT, PRODUCT, OTHER_PRODUCT],
      userId: USER,
    });

    const query = rendered();
    expect(flat(query.sql)).toContain(
      "AND reservation.product_id IN ( SELECT value::uuid FROM jsonb_array_elements_text(",
    );
    expect(query.params).toContain(JSON.stringify([PRODUCT, OTHER_PRODUCT]));
  });

  it("asks nothing for an empty list of pieces", async () => {
    expect(
      await listLapsedOwnPaymentOrderIds({ now: NOW, productIds: [], userId: USER }),
    ).toEqual([]);
    expect(database.queries).toHaveLength(0);
  });
});

describe("payment windows", () => {
  it("moves product, reservation and bag row to payment in one statement", async () => {
    await startPaymentForOwnedCartItems({
      items: [{
        currentReservationToken: "cart-token",
        paymentReservationToken: "payment-token",
        productId: PRODUCT,
      }],
      orderId: ORDER,
      reservedUntil: new Date("2026-09-08T13:00:00.000Z"),
      userId: USER,
    });

    const statement = rendered().sql;
    expect(statement).toContain("locked.cart_reservation_token =");
    expect(statement).toContain("INSERT INTO reservations");
    expect(statement).toContain("status = 'payment_pending'");
    expect(statement).toContain("final_guard AS MATERIALIZED");
    expect(statement).toContain("existing_reservation.order_id =");
  });

  it("never writes a payment hold beyond fifteen minutes from the order's own start or the cart deadline", async () => {
    // The claim clock is taken after the order row is written, so it is always
    // later than placed_at: a cap bound to it refused every ordinary checkout.
    const now = new Date("2026-09-08T12:50:00.030Z");
    const reservedUntil = new Date("2026-09-08T13:00:00.000Z");
    await startPaymentForOwnedCartItems({
      items: [{
        currentReservationToken: "cart-token",
        paymentReservationToken: "payment-token",
        productId: PRODUCT,
      }],
      now,
      orderId: ORDER,
      reservedUntil,
      userId: USER,
    });

    const query = rendered();
    expect(flat(section(query.sql, "locked_order AS", "locked_products AS"))).toContain(
      "SELECT target.id, target.payment_status, target.placed_at FROM orders AS target",
    );
    const caps = [
      ...query.sql.matchAll(
        /\$(\d+)::timestamptz <=\s+\(SELECT locked_order\.placed_at FROM locked_order\)\s+\+ \(\$(\d+) \* INTERVAL '1 minute'\)/g,
      ),
    ];
    // Once for resuming an already-claimed attempt, once for a fresh claim.
    expect(caps).toHaveLength(2);
    for (const [, hold, minutes] of caps) {
      expect(query.params[Number(hold) - 1]).toEqual(reservedUntil);
      expect(query.params[Number(minutes) - 1]).toBe(PAYMENT_LINK_HOLD_MINUTES);
    }
    // Those are the statement's only payment-window intervals, and no interval
    // of any length is added to a bound value such as the caller's clock.
    const paymentWindowIntervals = [
      ...query.sql.matchAll(/\(\$(\d+) \* INTERVAL '1 minute'\)/g),
    ].filter(([, minutes]) => query.params[Number(minutes) - 1] === PAYMENT_LINK_HOLD_MINUTES);
    expect(paymentWindowIntervals).toHaveLength(2);
    expect(query.sql).not.toMatch(/\$\d+(?:::timestamptz)?\s+\+ \(\$\d+ \* INTERVAL/);
    // The caller's clock still decides liveness.
    expect(paramAfter(query, "locked.product_reserved_until > ")).toEqual(now);
    expect(PAYMENT_LINK_HOLD_MINUTES).toBe(15);
    expect(section(query.sql, "locked AS", "guarded AS")).toMatch(
      /\$\d+ <=\s+cart\.added_at \+ \(\$\d+ \* INTERVAL '1 minute'\)/,
    );
    expect(section(query.sql, "guarded AS", "claimed AS")).toMatch(
      /\$\d+ <= locked\.cart_deadline/,
    );
  });
});

describe("terminal unpaid payments", () => {
  const restoration = {
    cartDeadline: new Date("2026-09-08T13:30:00.000Z"),
    paymentReservationToken: "payment-token",
    productId: PRODUCT,
    restorationReservationToken: "restore-token",
  };

  const releaseAttempt = () =>
    releasePaymentCartItems({
      items: [restoration],
      now: NOW,
      orderId: ORDER,
      reservedUntil: new Date("2026-09-08T13:00:00.000Z"),
      userId: USER,
    });

  it("fails the order and resolves exact payment authority in one statement", async () => {
    answer({
      rows: [{
        failed: true,
        previous_payment_status: "pending",
        released_product_ids: [PRODUCT],
        released_slugs: ["rose-silk"],
        restored_product_ids: [],
        restored_slugs: [],
      }],
    });

    expect(await releaseAttempt()).toEqual({
      kind: "released",
      releasedProductIds: [PRODUCT],
      releasedSlugs: ["rose-silk"],
      restoredProductIds: [],
      restoredSlugs: [],
    });
    expect(database.queries).toHaveLength(1);
    const query = rendered();
    expect(query.sql).toContain("cart.reserved_until = authority.expires_at");
    expect(query.sql).toContain("DELETE FROM user_cart_items AS cart");
    expect(query.sql).toContain("DELETE FROM reservations AS reservation");
    expect(query.sql).toContain("SET payment_status = 'failed'");
    expect(JSON.parse(String(query.params[0]))).toEqual([{
      cart_deadline: "2026-09-08T13:30:00.000Z",
      payment_reservation_token: "payment-token",
      product_id: PRODUCT,
      restoration_reservation_token: "restore-token",
    }]);
  });

  it("restores only the remaining original cart time, never a fresh window", async () => {
    answer({
      rows: [{
        failed: true,
        previous_payment_status: "pending",
        released_product_ids: [],
        released_slugs: [],
        restored_product_ids: [PRODUCT],
        restored_slugs: ["rose-silk"],
      }],
    });

    expect(await releaseAttempt()).toEqual({
      kind: "released",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [PRODUCT],
      restoredSlugs: ["rose-silk"],
    });
    const query = rendered();
    const restoredProducts = section(query.sql, "restored_products AS", "released_products AS");
    expect(restoredProducts).toContain("reserved_until = expected_input.cart_deadline");
    expect(paramAfter(query, "expected_input.cart_deadline > ")).toEqual(NOW);
    const restoredCart = section(query.sql, "restored_cart AS", "removed_cart AS");
    expect(restoredCart).toContain("reserved_until = expected_input.cart_deadline");
    expect(restoredCart).toContain(
      "reservation_token = expected_input.restoration_reservation_token",
    );
    expect(restoredCart).toContain("status = 'active'");
    // The deadline must be the line's original add time plus one hour, so no
    // caller can pass in a longer one.
    expect(query.sql).toMatch(
      /expected_input\.cart_deadline IS DISTINCT FROM\s+locked_cart\.added_at \+\s+\(\$\d+ \* INTERVAL '1 minute'\)/,
    );
    expect(paramAfter(query, "expected_input.cart_deadline <= ")).toEqual(NOW);
  });
});

describe("payment hold scans", () => {
  const EXPIRY = "2026-09-08T13:00:00.000Z";
  const holdRow = (overrides: Record<string, unknown> = {}) => ({
    cart_added_at: "2026-09-08T12:10:00.000Z",
    cart_reservation_token: "payment-token",
    cart_reserved_until: EXPIRY,
    cart_status: "payment_pending",
    expires_at: EXPIRY,
    order_id: ORDER,
    product_id: PRODUCT,
    product_reserved_until: EXPIRY,
    product_stock_status: "reserved",
    razorpay_order_id: "plink_123",
    total_paise: 100_000,
    user_id: USER,
    ...overrides,
  });
  const candidateFor = (expiry: string, cartDeadline: string) => ({
    items: [{
      cartDeadline: new Date(cartDeadline),
      paymentReservationToken: "payment-token",
      productId: PRODUCT,
    }],
    orderId: ORDER,
    productIds: [PRODUCT],
    providerPaymentId: "plink_123",
    reservedUntil: new Date(expiry),
    totalPaise: 100_000,
    userId: USER,
  });

  it("scans expired payment holds without releasing them from the local clock", async () => {
    answer({ rows: [holdRow()] });

    const result = await listExpiredPaymentHoldCandidates({
      now: NOW,
      productIds: [PRODUCT],
    });

    expect(result).toEqual({
      candidates: [candidateFor(EXPIRY, "2026-09-08T13:10:00.000Z")],
      conflictOrderIds: [],
      protectedProductIds: [PRODUCT],
    });
    expect(database.queries).toHaveLength(1);
    const statement = rendered().sql;
    expect(statement).not.toContain("UPDATE products");
    expect(statement).not.toContain("UPDATE orders");
    expect(statement).not.toContain("DELETE FROM");
  });

  it.each([
    ["its cart deadline lands before the payment expiry", { cart_added_at: "2026-09-08T11:00:00.000Z" }],
    ["its bag row is no longer in payment", { cart_status: "active" }],
    [
      "its hold has not lapsed yet",
      {
        cart_reserved_until: "2026-09-08T13:05:00.000Z",
        expires_at: "2026-09-08T13:05:00.000Z",
        product_reserved_until: "2026-09-08T13:05:00.000Z",
      },
    ],
  ])("keeps an order protected as a conflict when %s", async (_label, overrides) => {
    answer({ rows: [holdRow(overrides)] });

    expect(
      await listExpiredPaymentHoldCandidates({ now: NOW, productIds: [PRODUCT] }),
    ).toEqual({
      candidates: [],
      conflictOrderIds: [ORDER],
      protectedProductIds: [PRODUCT],
    });
  });

  it("gives a provider-terminal order the same exact candidate without waiting for the clock", async () => {
    const future = "2099-01-01T00:10:00.000Z";
    answer({
      rows: [
        holdRow({
          cart_added_at: "2099-01-01T00:00:00.000Z",
          cart_reserved_until: future,
          expires_at: future,
          product_reserved_until: future,
        }),
      ],
    });

    expect(await getPaymentHoldCandidateForOrder(ORDER)).toEqual({
      candidate: candidateFor(future, "2099-01-01T01:00:00.000Z"),
      kind: "candidate",
    });
    const query = rendered();
    expect(query.params).toEqual([ORDER]);
    expect(query.sql).toContain("payment_order.payment_status = 'pending'");
    expect(query.sql).not.toMatch(/UPDATE|DELETE|INSERT/);
  });

  it("reports a provider-terminal order that is not exact as a conflict", async () => {
    answer({ rows: [holdRow({ cart_status: "active" })] });

    expect(await getPaymentHoldCandidateForOrder(ORDER)).toEqual({
      kind: "conflict",
      protectedProductIds: [PRODUCT],
    });
  });

  it("reports none for an order with no pending reservation", async () => {
    expect(await getPaymentHoldCandidateForOrder(ORDER)).toEqual({ kind: "none" });
  });
});

describe("live payment hold for one order", () => {
  const readHold = () =>
    getLivePaymentHoldForOrder({ now: NOW, orderId: ORDER, userId: USER });

  it("returns the earliest expiry only when every reservation is the exact live hold", async () => {
    answer({
      rows: [
        { exact_live_hold: true, expires_at: "2026-09-08T13:09:00.000Z", product_id: PRODUCT },
        { exact_live_hold: true, expires_at: "2026-09-08T13:05:00.000Z", product_id: OTHER_PRODUCT },
      ],
    });

    expect(await readHold()).toEqual({
      expiresAt: new Date("2026-09-08T13:05:00.000Z"),
      productIds: [PRODUCT, OTHER_PRODUCT],
    });
    const query = rendered();
    expect(paramAfter(query, "payment_order.id = ")).toBe(ORDER);
    expect(paramAfter(query, "payment_order.user_id = ")).toBe(USER);
    expect(paramAfter(query, "reservation.expires_at > ")).toEqual(NOW);
    for (const predicate of [
      "payment_order.payment_status = 'pending'",
      "product.stock_status = 'reserved'",
      "product.reserved_until = reservation.expires_at",
      "cart.status = 'payment_pending'",
      "cart.reserved_until = reservation.expires_at",
      "cart.user_id = payment_order.user_id",
    ]) {
      expect(query.sql).toContain(predicate);
    }
  });

  it.each([
    ["one line is no longer the exact hold", false],
    ["the database could not prove one line", null],
  ])("returns null when %s", async (_label, secondLine) => {
    answer({
      rows: [
        { exact_live_hold: true, expires_at: "2026-09-08T13:09:00.000Z", product_id: PRODUCT },
        { exact_live_hold: secondLine, expires_at: "2026-09-08T13:09:00.000Z", product_id: OTHER_PRODUCT },
      ],
    });

    expect(await readHold()).toBeNull();
  });

  it("returns null for an order holding nothing", async () => {
    expect(await readHold()).toBeNull();
  });
});

describe("captured payment", () => {
  const completeRow = (overrides: Record<string, unknown> = {}) => ({
    completed: true,
    inventory_ok: true,
    previous_payment_id: null,
    previous_payment_status: "pending",
    sold_count: 1,
    sold_slugs: ["rose-silk"],
    ...overrides,
  });

  const complete = () =>
    completePaidCommerceState({
      orderId: ORDER,
      paidAt: NOW,
      paymentId: "pay_1",
      paymentMethod: "razorpay",
      userId: USER,
    });

  it("marks Sold and removes every bag line for it only inside the paid commit", async () => {
    answer({ rows: [completeRow()] });

    expect(await complete()).toEqual({
      kind: "completed",
      soldCount: 1,
      soldSlugs: ["rose-silk"],
    });
    expect(database.queries).toHaveLength(1);
    const query = rendered();
    const sold = section(query.sql, "sold AS", "deleted_cart AS");
    expect(sold).toContain("stock_status = 'sold'");
    expect(sold).toContain("FROM locked_products, paid_order");
    const payerCart = section(query.sql, "deleted_cart AS", "displaced_cart AS");
    expect(payerCart).toContain("DELETE FROM user_cart_items AS cart");
    expect(payerCart).toContain("USING all_items, locked_order, paid_order");
    // Once the exact order reservation wins the sold transition, even a stale
    // same-user cart expiry is safe to remove and must never reappear in GET.
    expect(payerCart).toContain("FROM reservable_items");
    expect(payerCart).not.toContain("reservations.expires_at = cart.reserved_until");
    const otherAccounts = section(query.sql, "displaced_cart AS", "cart_cleanup AS");
    expect(otherAccounts).toContain("DELETE FROM user_cart_items AS cart");
    expect(otherAccounts).toContain("USING sold");
    expect(otherAccounts).toContain("cart.product_id = sold.id");
    expect(otherAccounts).toContain(
      "cart.user_id IS DISTINCT FROM (SELECT user_id FROM locked_order)",
    );
    expect(query.sql).toContain("USING paid_order, cart_cleanup");
    expect(query.sql).not.toMatch(/UNION\s+UNION/);
  });

  it("reports a capture on an order that is no longer pending as a state conflict", async () => {
    answer({
      rows: [completeRow({ completed: false, previous_payment_status: "failed", sold_count: 0, sold_slugs: [] })],
    });

    expect((await complete()).kind).toBe("order_state_conflict");
  });

  it("uses the database clock for made-to-order cart fences", () => {
    const cartQueries = source("db/queries/user-cart.ts");
    expect(cartQueries.match(/statement_timestamp\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(cartQueries).toContain("cart.updated_at <= locked_order.placed_at");
  });
});

describe("stock transitions stamp the moment they happen", () => {
  // Notify Me waits for 60 seconds of availability measured from
  // products.updated_at. A caller's clock can be read long before the write
  // (a cron that spent a minute on provider calls), which backdated a release
  // and let the email go out seconds after the piece came free.
  const PAYMENT_HOLD = new Date("2026-09-08T13:10:00.000Z");
  const PAID_AT = new Date("2026-09-08T12:59:00.000Z");
  const paymentClaim = [{
    currentReservationToken: "cart-token",
    paymentReservationToken: "payment-token",
    productId: PRODUCT,
  }];
  const restoration = {
    cartDeadline: HOLD,
    paymentReservationToken: "payment-token",
    productId: PRODUCT,
    restorationReservationToken: "restore-token",
  };

  const removal = () =>
    removeOwnedCartItem({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "verified-token",
      reservedUntil: HOLD,
      userId: USER,
    });
  const tokenRelease = () =>
    releaseCartHoldByToken({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil: HOLD,
    });
  const expiry = () => expireHoldsForProducts([PRODUCT, OTHER_PRODUCT], NOW);
  const bagClaim = () =>
    claimProductIntoCart({
      now: NOW,
      productId: PRODUCT,
      reservationToken: "signed-token",
      reservedUntil: HOLD,
      userId: USER,
    });
  const paymentStart = () =>
    startPaymentForOwnedCartItems({
      items: paymentClaim,
      now: NOW,
      orderId: ORDER,
      reservedUntil: PAYMENT_HOLD,
      userId: USER,
    });
  const paymentEnd = () =>
    releasePaymentCartItems({
      items: [restoration],
      now: NOW,
      orderId: ORDER,
      reservedUntil: PAYMENT_HOLD,
      userId: USER,
    });
  const capture = () =>
    completePaidCommerceState({
      orderId: ORDER,
      paidAt: PAID_AT,
      paymentId: "pay_1",
      paymentMethod: "razorpay",
      updatedAt: NOW,
      userId: USER,
    });

  /** One products update's SET list, up to its FROM or WHERE. */
  const setClause = (text: string) => {
    const statement = flat(text);
    const start = statement.indexOf("SET ");
    if (start < 0) throw new Error("Missing SET clause");
    const rest = statement.slice(start);
    const end = rest.search(/ (?:FROM|WHERE) /);
    return end < 0 ? rest : rest.slice(0, end);
  };

  it.each([
    { from: "released AS", label: "a removal's exact release", run: removal, to: "removed AS" },
    { from: "released AS", label: "the old token release", run: tokenRelease, to: "removed AS" },
    { from: "freed AS", label: "the expiry sweep", run: expiry, to: "removed AS" },
    { from: "WITH claimed AS", label: "the bag claim", run: bagClaim, to: "saved AS" },
    { from: "claimed AS (", label: "the payment claim", run: paymentStart, to: "payment_reservations AS" },
    { from: "restored_products AS", label: "an unpaid link's restore", run: paymentEnd, to: "released_products AS" },
    { from: "released_products AS", label: "an unpaid link's release", run: paymentEnd, to: "restored_cart AS" },
    { from: "sold AS", label: "a capture's Sold", run: capture, to: "deleted_cart AS" },
  ])("$label stamps updated_at from the database, never the caller's clock", async ({ from, run, to }) => {
    await run();

    const query = rendered();
    const set = setClause(section(query.sql, from, to));
    expect(set).toContain("updated_at = statement_timestamp()");
    expect(set).not.toMatch(/updated_at = \$\d+/);
    expect(
      boundIn(query, set).some(
        (value) => value instanceof Date && value.getTime() === NOW.getTime(),
      ),
    ).toBe(false);
  });

  it.each([
    { fragment: "product.reserved_until <= ", label: "the expiry sweep", run: expiry },
    { fragment: "stock_status = 'reserved' AND reserved_until <= ", label: "the bag claim", run: bagClaim },
    { fragment: "locked.product_reserved_until > ", label: "the payment claim", run: paymentStart },
    { fragment: "expected_input.cart_deadline > ", label: "an unpaid link's restore", run: paymentEnd },
    { fragment: "expected_input.cart_deadline <= ", label: "an unpaid link's release", run: paymentEnd },
  ])("$label still measures deadlines against the caller's clock", async ({ fragment, run }) => {
    await run();

    expect(paramAfter(rendered(), fragment)).toEqual(NOW);
  });

  it("leaves no products update in the module stamping a bound time", () => {
    const updates = [
      ...source("db/queries/user-cart.ts").matchAll(
        /UPDATE products\b[\s\S]*?(?=\n\s*(?:FROM|WHERE)\b)/g,
      ),
    ].map(([update]) => update);

    // Remove, token release, expiry, bag claim, payment claim, restore,
    // release and Sold.
    expect(updates).toHaveLength(8);
    for (const update of updates) {
      expect(update).toContain("updated_at = statement_timestamp()");
    }
  });
});

describe("multi-product locks", () => {
  // Two statements taking the same pieces in different orders can deadlock,
  // and nothing retries a deadlock. Every statement takes them by id.
  it.each([
    {
      from: "locked_products AS",
      label: "the payment claim",
      run: () =>
        startPaymentForOwnedCartItems({
          items: [
            { currentReservationToken: "a", paymentReservationToken: "b", productId: OTHER_PRODUCT },
            { currentReservationToken: "c", paymentReservationToken: "d", productId: PRODUCT },
          ],
          now: NOW,
          orderId: ORDER,
          reservedUntil: HOLD,
          userId: USER,
        }),
      to: "locked AS",
    },
    {
      from: "locked_products AS",
      label: "an unpaid link's release",
      run: () =>
        releasePaymentCartItems({
          items: [],
          now: NOW,
          orderId: ORDER,
          reservedUntil: HOLD,
          userId: USER,
        }),
      to: "locked_cart AS",
    },
    {
      from: "locked_products AS",
      label: "a capture",
      run: () =>
        completePaidCommerceState({
          orderId: ORDER,
          paidAt: NOW,
          paymentId: "pay_1",
          paymentMethod: "razorpay",
          userId: USER,
        }),
      to: "inventory_guard AS",
    },
    {
      from: "expired AS",
      label: "the expiry sweep",
      run: () => expireHoldsForProducts([OTHER_PRODUCT, PRODUCT], NOW),
      to: "freed AS",
    },
    {
      from: "locked_products AS",
      label: "the bag prune",
      run: () => pruneUnownedCartRows({ now: NOW, userId: USER }),
      to: "DELETE FROM",
    },
  ])("$label locks its products in id order", async ({ from, run, to }) => {
    await run();

    expect(flat(section(rendered().sql, from, to))).toMatch(
      /ORDER BY product\.id FOR UPDATE OF product \)/,
    );
  });
});

describe("viewer-state rows", () => {
  const productRow = (overrides: Record<string, unknown> = {}) => ({
    cartReservationToken: null,
    cartReservedUntil: null,
    cartStatus: null,
    productId: PRODUCT,
    reservedUntil: null,
    stockStatus: "available",
    typeSlug: null,
    ...overrides,
  });

  it("answers only for published pieces, with no bag for a signed-out viewer", async () => {
    answer([productRow()]);

    expect(await getViewerStateRows([PRODUCT, PRODUCT], null)).toEqual([{
      cartReservationToken: null,
      cartReservedUntil: null,
      cartStatus: null,
      hasPendingPayment: false,
      madeToOrderInBag: false,
      productId: PRODUCT,
      reservedUntil: null,
      stockStatus: "available",
    }]);
    expect(database.queries).toHaveLength(1);
    const query = rendered();
    expect(query.sql).toMatch(/left join "user_cart_items" on false/);
    expect(paramAfter(query, '"products"."status" = ')).toBe("published");
    expect(query.params.filter((value) => value === PRODUCT)).toHaveLength(1);
  });

  it("flags a pending payment only for the exact current payment hold", async () => {
    answer(
      [productRow({ cartStatus: "payment_pending" }), productRow({ productId: OTHER_PRODUCT })],
      [{ productId: PRODUCT }],
    );

    const rows = await getViewerStateRows([PRODUCT, OTHER_PRODUCT], USER);

    expect(rows.map((row) => [row.productId, row.cartStatus, row.hasPendingPayment])).toEqual([
      [PRODUCT, "payment_pending", true],
      [OTHER_PRODUCT, null, false],
    ]);
    const pending = rendered(1);
    const cartJoin = section(pending.sql, 'inner join "user_cart_items" on', " where ");
    const cartJoinQuery = { params: pending.params, sql: cartJoin };
    expect(paramAfter(cartJoinQuery, '"user_cart_items"."user_id" = ')).toBe(USER);
    expect(cartJoin).toContain('"user_cart_items"."product_id" = "reservations"."product_id"');
    expect(paramAfter(cartJoinQuery, '"user_cart_items"."status" = ')).toBe(
      "payment_pending",
    );
    expect(cartJoin).toContain('"user_cart_items"."reserved_until" = "products"."reserved_until"');
    expect(paramAfter(pending, '"orders"."user_id" = ')).toBe(USER);
    expect(paramAfter(pending, '"orders"."payment_status" = ')).toBe("pending");
    expect(paramAfter(pending, '"products"."stock_status" = ')).toBe("reserved");
    expect(pending.sql).toContain('"reservations"."expires_at" = "products"."reserved_until"');
    // No clock bound: a lapsed link stays the payer's until reconciliation.
    expect(pending.params.some((value) => value instanceof Date)).toBe(false);
  });

  it("marks only a hold-free blouse line as made to order in the bag", async () => {
    answer(
      [
        productRow({ cartStatus: "active", typeSlug: "blouse" }),
        productRow({ cartStatus: "active", productId: OTHER_PRODUCT }),
        productRow({
          cartReservationToken: "token",
          cartReservedUntil: HOLD,
          cartStatus: "active",
          productId: THIRD_PRODUCT,
          typeSlug: "blouse",
        }),
        productRow({ productId: FOURTH_PRODUCT, typeSlug: "blouse" }),
      ],
      [],
    );

    const rows = await getViewerStateRows(
      [PRODUCT, OTHER_PRODUCT, THIRD_PRODUCT, FOURTH_PRODUCT],
      USER,
    );

    expect(Object.fromEntries(rows.map((row) => [row.productId, row.madeToOrderInBag]))).toEqual({
      [FOURTH_PRODUCT]: false,
      [OTHER_PRODUCT]: false,
      [PRODUCT]: true,
      [THIRD_PRODUCT]: false,
    });
    expect(rows[0]).not.toHaveProperty("typeSlug");
    expect(rendered(0).sql).toContain(
      'left join "product_types" on "product_types"."id" = "products"."type_id"',
    );
  });

  it("does no work for an empty request", async () => {
    expect(await getViewerStateRows([], USER)).toEqual([]);
    expect(database.queries).toHaveLength(0);
  });
});

describe("schema and migration", () => {
  const migration = source("drizzle/0032_user_cart_items.sql");
  const schema = source("db/schema.ts");

  it("keys the bag off the customer and the piece", () => {
    expect(migration).toContain('PRIMARY KEY ("user_id", "product_id")');
    expect(schema).toContain('name: "user_cart_items_pkey"');
  });

  it("indexes what the reads and the sweep actually filter on", () => {
    for (const index of [
      "user_cart_items_product_idx",
      "user_cart_items_reserved_until_idx",
      "user_cart_items_user_status_idx",
    ]) {
      expect(migration).toContain(index);
      expect(schema).toContain(index);
    }
  });

  it("cascades from both owners, leaving no orphan bag rows", () => {
    expect(migration).toContain('REFERENCES "users" ("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "products" ("id") ON DELETE CASCADE');
  });

  it("is re-appliable", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS");
    expect(migration.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(3);
  });

  it("adds no anonymous or guest cart table", () => {
    expect(migration).not.toContain("commerce_session");
    expect(migration).not.toContain("guest");
  });
});
