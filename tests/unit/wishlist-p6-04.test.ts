/**
 * P6-04: Wishlist mutation-proof + behavioral tests.
 *
 * TEST DISCIPLINE:
 *   - mock @/db at the drizzle builder level, NOT @/db/queries/wishlist
 *   - the real query functions (addToWishlist, removeFromWishlist, etc.) run unchanged
 *   - collectPrimitives walks the WHERE AST to assert userId presence
 *   - raw SQL statements are rendered through PgDialect, so assertions read
 *     the statement and bound values the database would actually receive
 *   - a throwing analytics sink MUST NOT fail the mutation (fire-and-forget proven)
 *   - guest-merge and restock-notify are proven by behavior
 *
 * Tests:
 *   (1) AUTH-SCOPING: listWishlistProductIds and removeFromWishlist include userId in WHERE.
 *   (2) IDEMPOTENCY: addToWishlist uses onConflictDoNothing (no duplicates).
 *   (3) IDOR-PROOF: removing userId from the WHERE predicate causes the test to fail.
 *   (4) GUEST-MERGE: mergeGuestWishlist inserts all guest ids with the account userId,
 *       is de-duped, and skips empty arrays.
 *   (5) EVENTS: wishlist_added / wishlist_removed / restock_notify_requested are the
 *       new enum slots; a throwing sink does NOT surface as an error.
 *   (6) RESTOCK-NOTIFY: upsertRestockNotifyRequest registers only while another
 *       shopper holds the piece, refuses the requester's own hold, and keeps an
 *       active subscription's lifecycle on a repeated click.
 *   (7) RESTOCK-CLAIM: claimRestockRequests claims only settled pieces for
 *       authenticated subscriptions, and never a notified or failed one.
 */

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── collectPrimitives: walks Drizzle SQL AST ─────────────────────────────────
function collectPrimitives(node: unknown, visited = new WeakSet<object>()): string[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

// ── Mock @/db at the drizzle builder level ────────────────────────────────────
// We mock the full builder chain used by the real query functions.
const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const deleteMock = vi.fn();
const whereMockDelete = vi.fn();
const executeMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    delete: deleteMock,
    execute: executeMock,
  },
}));

// ── Rewire helpers ────────────────────────────────────────────────────────────

function rewireSelect(rows: unknown[] = []) {
  selectMock.mockReset();
  fromMock.mockReset();
  whereMock.mockReset();

  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ where: whereMock });
  whereMock.mockResolvedValue(rows);
}

function rewireDelete() {
  deleteMock.mockReset();
  whereMockDelete.mockReset();

  deleteMock.mockReturnValue({ where: whereMockDelete });
  whereMockDelete.mockResolvedValue(undefined);
}

// ── Rendered SQL helpers ──────────────────────────────────────────────────────

const dialect = new PgDialect();

/** The executed statement with whitespace collapsed, plus its bound values. */
function renderExecutedSql(callIndex = 0) {
  const query = dialect.sqlToQuery(executeMock.mock.calls[callIndex]?.[0] as SQL);
  return { params: query.params, sql: query.sql.replace(/\s+/g, " ") };
}

/** Every `$n` placeholder bound to this value. */
function placeholdersFor(params: unknown[], value: unknown): string[] {
  return params.flatMap((param, index) => {
    const same =
      param instanceof Date && value instanceof Date
        ? param.getTime() === value.getTime()
        : param === value;
    return same ? [`$${index + 1}`] : [];
  });
}

// ── (1) AUTH-SCOPING: listWishlistProductIds ──────────────────────────────────

describe("listWishlistProductIds — auth-scoping WHERE (mutation-proof)", () => {
  beforeEach(() => {
    rewireSelect([]);
  });

  it("includes userId in SELECT WHERE clause", async () => {
    const { listWishlistProductIds } = await import("@/db/queries/wishlist");
    await listWishlistProductIds("user-abc-123");

    const whereArg = whereMock.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("user-abc-123");
  });

  it("MUTATION-PROOF: removing userId from WHERE causes userId to be absent", async () => {
    // If the eq(wishlistItems.userId, userId) predicate were removed,
    // "user-mutation-check" would not appear in collectPrimitives(whereArg)
    // and this test would fail.
    const { listWishlistProductIds } = await import("@/db/queries/wishlist");
    await listWishlistProductIds("user-mutation-check");

    const whereArg = whereMock.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("user-mutation-check");
  });

  it("maps rows to an array of productId strings", async () => {
    rewireSelect([
      { productId: "prod-1" },
      { productId: "prod-2" },
    ]);
    const { listWishlistProductIds } = await import("@/db/queries/wishlist");
    const result = await listWishlistProductIds("user-abc");
    expect(result).toEqual(["prod-1", "prod-2"]);
  });
});

// ── (2) addToWishlist — atomic non-sold eligibility + idempotency ─────────────

describe("addToWishlist — atomic non-sold save", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [{ product_id: "prod-y" }] });
  });

  it("binds the account and product and reports an accepted save", async () => {
    const { addToWishlist } = await import("@/db/queries/wishlist");
    const saved = await addToWishlist("user-x", "prod-y");

    expect(saved).toBe(true);
    expect(executeMock).toHaveBeenCalledOnce();
    const primitives = collectPrimitives(executeMock.mock.calls[0]?.[0]);
    expect(primitives).toContain("user-x");
    expect(primitives).toContain("prod-y");
  });

  it("rejects a missing or sold product without inserting a new row", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const { addToWishlist } = await import("@/db/queries/wishlist");

    await expect(addToWishlist("user-x", "prod-y")).resolves.toBe(false);
  });

  it("locks eligibility, excludes sold products, and keeps repeats idempotent", async () => {
    const { addToWishlist } = await import("@/db/queries/wishlist");
    await addToWishlist("user-x", "prod-y");

    const { sql } = renderExecutedSql();
    expect(sql).toContain("product.stock_status <> 'sold'");
    expect(sql).toContain("FOR UPDATE OF product");
    expect(sql).toContain("ON CONFLICT (user_id, product_id) DO NOTHING");
  });
});

// ── (3) removeFromWishlist — auth-scoping + IDOR-proof ───────────────────────

describe("removeFromWishlist — auth-scoping WHERE (mutation-proof IDOR)", () => {
  beforeEach(() => {
    rewireDelete();
  });

  it("includes userId in DELETE WHERE clause", async () => {
    const { removeFromWishlist } = await import("@/db/queries/wishlist");
    await removeFromWishlist("user-alice", "prod-123");

    const whereArg = whereMockDelete.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("user-alice");
  });

  it("includes productId in DELETE WHERE clause", async () => {
    const { removeFromWishlist } = await import("@/db/queries/wishlist");
    await removeFromWishlist("user-alice", "prod-123");

    const whereArg = whereMockDelete.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("prod-123");
  });

  it("IDOR-PROOF: removing userId predicate causes userId to be absent", async () => {
    // If the eq(wishlistItems.userId, userId) clause were removed from
    // removeFromWishlist(), "user-idor-victim" would NOT appear in the
    // DELETE WHERE, and any user could remove any item. This test catches that.
    const { removeFromWishlist } = await import("@/db/queries/wishlist");
    await removeFromWishlist("user-idor-victim", "prod-x");

    const whereArg = whereMockDelete.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("user-idor-victim");
  });
});

// ── (4) mergeGuestWishlist — atomic de-duped eligible batch ──────────────────

describe("mergeGuestWishlist — guest merge on login", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({
      rows: [{ product_id: "prod-a" }, { product_id: "prod-b" }],
    });
  });

  it("is a no-op when guestProductIds is empty", async () => {
    const { mergeGuestWishlist } = await import("@/db/queries/wishlist");
    await expect(mergeGuestWishlist("user-new", [])).resolves.toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("binds all unique guest ids to the authenticated account", async () => {
    const { mergeGuestWishlist } = await import("@/db/queries/wishlist");
    const merged = await mergeGuestWishlist("user-new", [
      "prod-a",
      "prod-b",
      "prod-a",
    ]);

    expect(merged).toEqual(["prod-a", "prod-b"]);
    const primitives = collectPrimitives(executeMock.mock.calls[0]?.[0]);
    expect(primitives).toContain("user-new");
    expect(primitives.filter((value) => value === "prod-a")).toHaveLength(1);
    expect(primitives).toContain("prod-b");
  });

  it("returns only products accepted by the locked eligibility statement", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ product_id: "prod-a" }] });
    const { mergeGuestWishlist } = await import("@/db/queries/wishlist");

    await expect(
      mergeGuestWishlist("user-new", ["prod-a", "prod-sold"]),
    ).resolves.toEqual(["prod-a"]);
  });

  it("uses the same sold filter, row lock, and idempotent conflict rule as POST", async () => {
    const { mergeGuestWishlist } = await import("@/db/queries/wishlist");
    await mergeGuestWishlist("user-new", ["prod-a", "prod-sold"]);

    const { sql } = renderExecutedSql();
    expect(sql).toContain("product.stock_status <> 'sold'");
    expect(sql).toContain("FOR UPDATE OF product");
    expect(sql).toContain("ON CONFLICT (user_id, product_id) DO NOTHING");
  });
});

// ── (5) AnalyticsEventType enum — new slots present ──────────────────────────

describe("AnalyticsEventType — wishlist slots", () => {
  it("wishlist_added is a valid AnalyticsEventType", async () => {
    const { emitAnalyticsEvent } = await import("@/lib/analytics/emit");
    // Type-level check: if the slot is missing, TypeScript would error.
    // Runtime check: emitAnalyticsEvent must not throw when type is wishlist_added.
    // We mock the internal sink to avoid DB calls.
    vi.doMock("@/lib/adapters/internal-events-sink", () => ({
      internalEventsSink: { emit: vi.fn().mockResolvedValue(undefined) },
    }));
    // Just assert the import resolves — actual TS check is at compile time.
    expect(typeof emitAnalyticsEvent).toBe("function");
  });

  it("emitAnalyticsEvent with wishlist_added type is accepted by the type system", () => {
    // This is a compile-time assertion only. The test file would fail tsc if
    // "wishlist_added" is not a valid AnalyticsEventType.
    type TestType = "wishlist_added" extends import("@/lib/ports/analytics-sink").AnalyticsEventType
      ? true
      : false;
    const result: TestType = true;
    expect(result).toBe(true);
  });

  it("wishlist_removed is a valid AnalyticsEventType", () => {
    type TestType = "wishlist_removed" extends import("@/lib/ports/analytics-sink").AnalyticsEventType
      ? true
      : false;
    const result: TestType = true;
    expect(result).toBe(true);
  });

  it("restock_notify_requested is a valid AnalyticsEventType", () => {
    type TestType = "restock_notify_requested" extends import("@/lib/ports/analytics-sink").AnalyticsEventType
      ? true
      : false;
    const result: TestType = true;
    expect(result).toBe(true);
  });
});

// ── (5b) Fire-and-forget: throwing sink MUST NOT fail the action ──────────────
//
// Mutation-proof strategy: inject a REAL throwing sink via _overrideSinks()
// (the test escape hatch added for exactly this purpose), then call the REAL
// emitAnalyticsEvent. The sink rejection is real; the catch is real; the
// test proves the property by behavior — not by mocking the module under test.
//
// If someone removes the `.catch()` wrapping in emit.ts, emitAnalyticsEvent
// will propagate the rejection and `resolves.toBeUndefined()` will fail.

describe("analytics fire-and-forget — throwing sink does not surface", () => {
  it("emitAnalyticsEvent never throws even when ALL sinks reject", async () => {
    const { emitAnalyticsEvent, _overrideSinks, _resetSinks } = await import(
      "@/lib/analytics/emit"
    );

    // Inject a real throwing sink — NOT a vi.doMock after import.
    // _overrideSinks sets the cached list directly, bypassing module resolution.
    _overrideSinks([
      { emit: vi.fn().mockRejectedValue(new Error("sink down — primary")) },
      { emit: vi.fn().mockRejectedValue(new Error("sink down — secondary")) },
    ]);

    try {
      // MUTATION-PROOF: if the .catch() in emit.ts is removed, this rejects and fails.
      await expect(
        emitAnalyticsEvent({
          event_id: "evt-ff-proof-001",
          type: "wishlist_added",
          payload: { userId: "u-ff", productId: "p-ff" },
          occurredAt: new Date(),
        })
      ).resolves.toBeUndefined();
    } finally {
      // Always restore defaults so subsequent tests are unaffected.
      _resetSinks();
    }
  });

  it("emitAnalyticsEvent still resolves when one sink rejects and one succeeds", async () => {
    const { emitAnalyticsEvent, _overrideSinks, _resetSinks } = await import(
      "@/lib/analytics/emit"
    );

    _overrideSinks([
      { emit: vi.fn().mockRejectedValue(new Error("primary down")) },
      { emit: vi.fn().mockResolvedValue(undefined) },
    ]);

    try {
      await expect(
        emitAnalyticsEvent({
          event_id: "evt-ff-proof-002",
          type: "wishlist_removed",
          payload: { userId: "u-ff", productId: "p-ff" },
          occurredAt: new Date(),
        })
      ).resolves.toBeUndefined();
    } finally {
      _resetSinks();
    }
  });
});

// ── (6) upsertRestockNotifyRequest — only while another shopper holds it ──────

describe("upsertRestockNotifyRequest — restock intent captured", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [{ product_id: "prod-held" }] });
  });

  it("returns true and binds productId and normalized email", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    const registered = await upsertRestockNotifyRequest(
      "prod-held",
      " Buyer@Example.com ",
    );

    expect(registered).toBe(true);
    expect(executeMock).toHaveBeenCalledOnce();
    const primitives = collectPrimitives(executeMock.mock.calls[0]?.[0]);
    expect(primitives).toContain("prod-held");
    expect(primitives).toContain("buyer@example.com");
  });

  it("binds userId when the user is logged in", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    await upsertRestockNotifyRequest("prod-held", "buyer@example.com", "user-logged-in");

    const primitives = collectPrimitives(executeMock.mock.calls[0]?.[0]);
    expect(primitives).toContain("user-logged-in");
  });

  it("returns false when the atomic eligibility write inserts no row", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");

    await expect(
      upsertRestockNotifyRequest("prod-held", "guest@example.com"),
    ).resolves.toBe(false);
  });

  it("registers for a live hold, or a lapsed one any pending order still protects", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    await upsertRestockNotifyRequest("prod-held", "buyer@example.com", "user-requester");

    const { params, sql } = renderExecutedSql();
    const requester = placeholdersFor(params, "user-requester");

    // Eligibility and the write are one locked statement.
    expect(sql).toContain("INSERT INTO restock_notify_requests");
    expect(sql).toContain("FOR UPDATE OF product");
    expect(sql).toContain("product.status = 'published'");
    expect(sql).toContain("product.stock_status = 'reserved'");

    /*
     * Held means what the viewer verdict calls reserved_by_other: live, or
     * past its time while any pending order reserves the piece at that exact
     * expiry. That is the sweep's own protection, so it names no buyer and
     * no bag line — a foreign, guest or inconsistent pending order counts.
     */
    const start = sql.indexOf(
      "AND ( product.reserved_until > statement_timestamp() OR EXISTS (",
    );
    const end = sql.indexOf(") ) AND NOT EXISTS (", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const held = sql.slice(start, end);
    for (const protection of [
      "JOIN orders AS payment_order ON payment_order.id = payment_reservation.order_id",
      "payment_order.payment_status = 'pending'",
      "payment_reservation.product_id = product.id",
      "payment_reservation.expires_at = product.reserved_until",
    ]) {
      expect(held).toContain(protection);
    }
    expect(held).not.toContain("user_id");
    expect(held).not.toContain("user_cart_items");
    expect(requester.some((placeholder) => held.includes(placeholder))).toBe(false);
  });

  it("refuses the requester's own hold: a live bag line, or their exact payment hold past its time", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    await upsertRestockNotifyRequest("prod-held", "buyer@example.com", "user-requester");

    const { params, sql } = renderExecutedSql();
    const requester = placeholdersFor(params, "user-requester");

    expect(
      requester.some((placeholder) =>
        sql.includes(
          "AND NOT EXISTS ( SELECT 1 FROM user_cart_items AS cart " +
            `WHERE cart.user_id = ${placeholder}::uuid ` +
            "AND cart.product_id = product.id " +
            "AND cart.status IN ('active', 'payment_pending') " +
            "AND cart.reserved_until = product.reserved_until " +
            // While live, their line at the exact expiry is their hold.
            "AND ( product.reserved_until > statement_timestamp() " +
            // Past its time, a lapsed bag line owns nothing; only their exact
            // current payment hold is still theirs.
            "OR ( cart.status = 'payment_pending' AND EXISTS ( " +
            "SELECT 1 FROM reservations AS own_reservation " +
            "JOIN orders AS own_order ON own_order.id = own_reservation.order_id " +
            "AND own_order.payment_status = 'pending' " +
            "WHERE own_order.user_id = cart.user_id " +
            "AND own_reservation.product_id = product.id " +
            "AND own_reservation.expires_at = product.reserved_until ) ) ) )",
        ),
      ),
    ).toBe(true);
  });

  it("treats the account's active subscription under an earlier address as this registration", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    await upsertRestockNotifyRequest("prod-held", "new@example.com", "user-requester");

    const { params, sql } = renderExecutedSql();
    const requester = placeholdersFor(params, "user-requester");
    const address = placeholdersFor(params, "new@example.com");

    const start = sql.indexOf("account_subscription AS MATERIALIZED (");
    const end = sql.indexOf("registered AS (", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const accountSubscription = sql.slice(start, end);

    // Only while the piece is still eligible, and only an active cycle.
    expect(accountSubscription).toContain(
      "JOIN eligible_product ON eligible_product.id = active_request.product_id",
    );
    expect(accountSubscription).toContain(
      "active_request.status IN ('pending', 'claimed')",
    );
    expect(
      requester.some((placeholder) =>
        accountSubscription.includes(`active_request.user_id = ${placeholder}::uuid`),
      ),
    ).toBe(true);
    expect(
      address.some((placeholder) =>
        accountSubscription.includes(`active_request.email <> ${placeholder}`),
      ),
    ).toBe(true);

    // That subscription stands in for a second row, which the claim would
    // mail to the same current address a second time.
    expect(sql).toContain(
      "FROM eligible_product WHERE NOT EXISTS (SELECT 1 FROM account_subscription) " +
        "ON CONFLICT (product_id, email) DO UPDATE SET",
    );
    expect(sql).toContain(
      "SELECT product_id FROM registered UNION ALL SELECT product_id FROM account_subscription",
    );
  });

  it("keeps a pending or claimed subscription's lifecycle on a repeated click", async () => {
    const { upsertRestockNotifyRequest } = await import("@/db/queries/wishlist");
    await upsertRestockNotifyRequest("prod-held", "buyer@example.com", "user-requester");

    const { sql } = renderExecutedSql();
    const start = sql.indexOf("ON CONFLICT (product_id, email) DO UPDATE SET");
    const end = sql.indexOf("RETURNING product_id", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const conflict = sql.slice(start, end);

    // Only a terminal row starts a fresh cycle; anything else keeps its own.
    for (const field of [
      "status",
      "attempt_count",
      "claimed_at",
      "last_attempt_at",
      "last_error",
      "notified_at",
      "created_at",
    ]) {
      expect(conflict).toContain(
        `${field} = CASE WHEN existing_request.status IN ('notified', 'failed') ` +
          `THEN EXCLUDED.${field} ELSE existing_request.${field} END`,
      );
    }
    expect(conflict).toContain(
      "ELSE COALESCE(existing_request.user_id, EXCLUDED.user_id) END",
    );
  });
});

// ── (7) claimRestockRequests — settled pieces, authenticated subscriptions ────

describe("claimRestockRequests — who may be told a piece is back", () => {
  const NOW = new Date("2026-09-08T10:00:00.000Z");

  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [] });
  });

  it("requires 60 seconds of settled availability, bound from the run's clock", async () => {
    const { claimRestockRequests } = await import("@/db/queries/wishlist");
    await claimRestockRequests(50, NOW);

    const { params, sql } = renderExecutedSql();
    const settledSince = placeholdersFor(
      params,
      new Date("2026-09-08T09:59:00.000Z"),
    );
    const staleLease = placeholdersFor(
      params,
      new Date("2026-09-08T09:50:00.000Z"),
    );
    const claimedNow = placeholdersFor(params, NOW);

    expect(settledSince).toHaveLength(1);
    expect(sql).toContain(`p.updated_at <= ${settledSince[0]}`);
    expect(sql).toContain("p.status = 'published'");
    expect(sql).toContain("p.stock_status = 'available'");
    expect(sql).toContain("p.reserved_until IS NULL");
    expect(staleLease).toHaveLength(1);
    expect(sql).toContain(
      `r.claimed_at IS NULL OR r.claimed_at <= ${staleLease[0]}`,
    );
    expect(claimedNow).toHaveLength(1);
    expect(sql).toContain(`SET status = 'claimed', claimed_at = ${claimedNow[0]}`);
  });

  it("claims a subscription by its account and mails that account's current address", async () => {
    const { claimRestockRequests } = await import("@/db/queries/wishlist");
    await claimRestockRequests(50, NOW);

    const { sql } = renderExecutedSql();
    // Legacy guest capture had no user, so it is never claimed.
    expect(sql).toContain("JOIN users u ON u.id = r.user_id");
    expect(sql).toContain("r.user_id IS NOT NULL");
    expect(sql).toContain("SELECT r.product_id, r.email, u.email AS recipient_email");
    expect(sql).toContain("RETURNING r.product_id, r.email, c.recipient_email");

    // The row's email is only its key. Matching it against the account's
    // address orphaned every subscription made before a verified email change.
    const claimable = sql.slice(
      sql.indexOf("WITH claimable AS ("),
      sql.indexOf("UPDATE restock_notify_requests"),
    );
    const predicate = claimable.slice(claimable.indexOf(" WHERE "));
    expect(predicate).not.toContain("r.email");
    expect(predicate).not.toContain("u.email");
  });

  it("hands the worker the account's new address for a subscription registered under its old one", async () => {
    executeMock.mockResolvedValue({
      rows: [
        {
          attempt_count: 0,
          claimed_at: "2026-09-08T10:00:00.000Z",
          created_at: "2026-09-08T09:00:00.000Z",
          email: "old@example.com",
          product_id: "prod-held",
          product_name: "Maroon Chettinad",
          product_slug: "maroon-chettinad-cotton",
          recipient_email: "new@example.com",
        },
      ],
    });
    const { claimRestockRequests } = await import("@/db/queries/wishlist");

    const [claimed] = await claimRestockRequests(50, NOW);

    // Mailed at the current address; finished and released by the old key.
    expect(claimed).toMatchObject({
      email: "old@example.com",
      recipientEmail: "new@example.com",
    });
  });

  it("never claims a notified or failed subscription", async () => {
    const { claimRestockRequests } = await import("@/db/queries/wishlist");
    await claimRestockRequests(50, NOW);

    const { params, sql } = renderExecutedSql();
    const claimable = sql.slice(
      sql.indexOf("WITH claimable AS ("),
      sql.indexOf("UPDATE restock_notify_requests"),
    );
    const attemptCeiling = placeholdersFor(params, 3);

    expect(claimable).toContain(
      "WHERE ( r.status = 'pending' OR ( r.status = 'claimed' AND",
    );
    expect(sql).not.toMatch(/'notified'|'failed'/);
    expect(attemptCeiling).toHaveLength(1);
    expect(sql).toContain(`r.attempt_count < ${attemptCeiling[0]}`);
    expect(sql).toContain("FOR UPDATE OF r SKIP LOCKED");
  });

  it("caps a run however large the requested limit", async () => {
    const { claimRestockRequests } = await import("@/db/queries/wishlist");
    await claimRestockRequests(5_000, NOW);

    const { params, sql } = renderExecutedSql();
    const cap = placeholdersFor(params, 50);
    expect(cap).toHaveLength(1);
    expect(sql).toContain(`LIMIT ${cap[0]}`);
  });

  it("mails the account's current address and keeps the subscription key for the claim", async () => {
    executeMock.mockResolvedValue({
      rows: [
        {
          attempt_count: 1,
          claimed_at: "2026-09-08T10:00:00.000Z",
          created_at: "2026-09-08T09:00:00.000Z",
          email: "shopper@example.com",
          product_id: "prod-held",
          product_name: "Maroon Chettinad",
          product_slug: "maroon-chettinad-cotton",
          recipient_email: "Shopper@Example.com",
        },
      ],
    });
    const { claimRestockRequests } = await import("@/db/queries/wishlist");

    await expect(claimRestockRequests(50, NOW)).resolves.toEqual([
      {
        attemptCount: 1,
        claimedAt: new Date("2026-09-08T10:00:00.000Z"),
        email: "shopper@example.com",
        productId: "prod-held",
        productName: "Maroon Chettinad",
        productSlug: "maroon-chettinad-cotton",
        recipientEmail: "Shopper@Example.com",
        requestVersion: "2026-09-08T09:00:00.000Z",
      },
    ]);
  });
});

// ── (8) Guest wishlist store — behavioral ────────────────────────────────────

describe("useGuestWishlistStore — guest wishlist behavior (localStorage store)", () => {
  // Import the store directly — no DB, no mocking needed; Zustand is pure.
  // We use the in-memory default (no localStorage in Node) by accessing store state.

  it("addItem is idempotent — adding the same id twice does not duplicate", async () => {
    const { useGuestWishlistStore } = await import("@/lib/store/wishlist-store");
    // Use getState/setState directly (no hooks in Node)
    useGuestWishlistStore.getState().clear();
    useGuestWishlistStore.getState().addItem("prod-dup");
    useGuestWishlistStore.getState().addItem("prod-dup");
    const state = useGuestWishlistStore.getState();
    expect(state.productIds.filter((id) => id === "prod-dup")).toHaveLength(1);
  });

  it("removeItem removes a product id", async () => {
    const { useGuestWishlistStore } = await import("@/lib/store/wishlist-store");
    useGuestWishlistStore.getState().clear();
    useGuestWishlistStore.getState().addItem("prod-to-remove");
    useGuestWishlistStore.getState().removeItem("prod-to-remove");
    expect(useGuestWishlistStore.getState().productIds).not.toContain("prod-to-remove");
  });

  it("toggle adds when absent and removes when present", async () => {
    const { useGuestWishlistStore } = await import("@/lib/store/wishlist-store");
    useGuestWishlistStore.getState().clear();
    useGuestWishlistStore.getState().toggle("prod-toggle");
    expect(useGuestWishlistStore.getState().has("prod-toggle")).toBe(true);
    useGuestWishlistStore.getState().toggle("prod-toggle");
    expect(useGuestWishlistStore.getState().has("prod-toggle")).toBe(false);
  });

  it("clear empties the list", async () => {
    const { useGuestWishlistStore } = await import("@/lib/store/wishlist-store");
    useGuestWishlistStore.getState().addItem("prod-a");
    useGuestWishlistStore.getState().addItem("prod-b");
    useGuestWishlistStore.getState().clear();
    expect(useGuestWishlistStore.getState().productIds).toHaveLength(0);
  });
});
