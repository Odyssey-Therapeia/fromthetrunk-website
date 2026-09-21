/**
 * The restock notification lifecycle.
 *
 * The capture layer shipped long before a sender existed, so the control was
 * parked rather than lying to shoppers. These are the guarantees that had to
 * hold before it could be turned back on.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const notifiedMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select: selectMock },
  withRetry: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("@/db/schema", () => ({
  products: {
    id: "products.id",
    reservedUntil: "reserved_until",
    status: "status",
    stockStatus: "stock_status",
    updatedAt: "updated_at",
  },
}));
vi.mock("drizzle-orm", () => ({ eq: (...args: unknown[]) => ({ args, op: "eq" }) }));
vi.mock("@/db/queries/wishlist", () => ({
  claimRestockRequests: claimMock,
  markRestockRequestNotified: notifiedMock,
  releaseRestockRequest: releaseMock,
  RESTOCK_STABILISATION_MS: 60_000,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: logErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const { runRestockNotifications } = await import(
  "@/lib/wishlist/restock-worker"
);

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CLAIMED_AT = new Date("2026-09-08T10:00:00.000Z");

/** A piece that has sat free, unheld and published for five minutes. */
const stockRow = (overrides: Record<string, unknown> = {}) => {
  const limit = vi.fn().mockResolvedValue([
    {
      reservedUntil: null,
      status: "published",
      stockStatus: "available",
      updatedAt: new Date(Date.now() - 5 * 60_000),
      ...overrides,
    },
  ]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from };
};

const failingStockRow = () => {
  const limit = vi.fn().mockRejectedValue(new Error("connection reset"));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from };
};

const request = (overrides: Record<string, unknown> = {}) => ({
  attemptCount: 0,
  claimedAt: CLAIMED_AT,
  email: "shopper@example.com",
  productId: PRODUCT_ID,
  productName: "Maroon Chettinad",
  productSlug: "maroon-chettinad-cotton",
  // The account's current address; the subscription key stays normalised.
  recipientEmail: "Shopper@Example.com",
  requestVersion: "2026-09-08T09:00:00.000Z",
  ...overrides,
});

describe("restock notification worker", () => {
  beforeEach(() => {
    selectMock.mockReset();
    claimMock.mockReset();
    notifiedMock.mockReset();
    releaseMock.mockReset();
    sendEmailMock.mockReset();
    logErrorMock.mockReset();

    sendEmailMock.mockResolvedValue(true);
    notifiedMock.mockResolvedValue(true);
    releaseMock.mockResolvedValue(true);
  });

  it("emails the account's own address when its piece is genuinely back", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());

    const summary = await runRestockNotifications();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: expect.stringMatching(/^restock-[a-f0-9]{64}$/),
      to: "Shopper@Example.com",
    });
    expect(notifiedMock).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ claimed: 1, notified: 1 });
  });

  it("mails the account's new address for a subscription registered under its old one", async () => {
    // The claim hands over the account's current address; the row's own
    // email stays the key the claim is finished with.
    claimMock.mockResolvedValue([
      request({ email: "old@example.com", recipientEmail: "new@example.com" }),
    ]);
    selectMock.mockReturnValue(stockRow());

    await runRestockNotifications();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({ to: "new@example.com" });
    expect(notifiedMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      "old@example.com",
      CLAIMED_AT,
    );
  });

  it("reuses one provider operation for retries of the same subscription", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());

    await runRestockNotifications();
    await runRestockNotifications();

    const firstKey = sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey;
    const retryKey = sendEmailMock.mock.calls[1]?.[0]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  it("uses a new provider operation for a deliberate new subscription cycle", async () => {
    claimMock
      .mockResolvedValueOnce([request()])
      .mockResolvedValueOnce([
        request({ requestVersion: "2026-09-09T09:00:00.000Z" }),
      ]);
    selectMock.mockReturnValue(stockRow());

    await runRestockNotifications();
    await runRestockNotifications();

    const firstKey = sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey;
    const nextCycleKey = sendEmailMock.mock.calls[1]?.[0]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(nextCycleKey).toBeTruthy();
    expect(nextCycleKey).not.toBe(firstKey);
  });

  it("checks availability again immediately before sending", async () => {
    // One-of-one pieces move fast: the window can close between the claim and
    // the send, and an email about a saree already gone is worse than none.
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow({ stockStatus: "reserved" }));

    const summary = await runRestockNotifications();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ notified: 0, skipped: 1 });
    // Not a failure: the request waits for the next time it comes back.
    expect(releaseMock.mock.calls[0]?.[3]).toMatchObject({ retryable: false });
  });

  it.each([
    {
      case: "was released less than 60 seconds ago",
      row: { updatedAt: new Date(Date.now() - 30_000) },
    },
    {
      case: "still carries a hold expiry",
      row: { reservedUntil: new Date(Date.now() + 10 * 60_000) },
    },
  ])("does not email about a piece that $case", async ({ row }) => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow(row));

    const summary = await runRestockNotifications();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ failed: 0, notified: 0, skipped: 1 });
    expect(releaseMock.mock.calls[0]?.[3]).toEqual({
      reason: null,
      retryable: false,
    });
  });

  it("does not email about an unpublished piece", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow({ status: "draft" }));

    await runRestockNotifications();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns a rejected send to the queue", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());
    sendEmailMock.mockResolvedValue(false);

    const summary = await runRestockNotifications();

    expect(notifiedMock).not.toHaveBeenCalled();
    expect(releaseMock.mock.calls[0]?.[3]).toMatchObject({
      reason: "send_rejected",
      retryable: true,
    });
    expect(summary).toMatchObject({ failed: 1 });
  });

  it("keeps a thrown send from stranding the row as claimed", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());
    sendEmailMock.mockRejectedValue(new Error("provider down"));

    const summary = await runRestockNotifications();

    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ failed: 1 });
  });

  it("records no recipient or provider payload in the failure reason", async () => {
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());
    sendEmailMock.mockRejectedValue(new Error("smtp said shopper@example.com"));

    await runRestockNotifications();

    const reason = String(releaseMock.mock.calls[0]?.[3]?.reason ?? "");
    expect(reason).toBe("send_threw");
    expect(reason).not.toContain("@");
  });

  it("sends once, records it, and a later run has nothing left to send", async () => {
    // A one-row stand-in for the table: the claim hands out only pending rows
    // and recording the send moves the row to notified.
    const subscription = { status: "pending" as "claimed" | "notified" | "pending" };
    claimMock.mockImplementation(async () => {
      if (subscription.status !== "pending") return [];
      subscription.status = "claimed";
      return [request()];
    });
    notifiedMock.mockImplementation(async () => {
      subscription.status = "notified";
      return true;
    });
    selectMock.mockReturnValue(stockRow());

    const first = await runRestockNotifications();
    const second = await runRestockNotifications();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(notifiedMock).toHaveBeenCalledTimes(1);
    expect(notifiedMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      "shopper@example.com",
      CLAIMED_AT,
    );
    expect(subscription.status).toBe("notified");
    expect(first).toEqual({ claimed: 1, failed: 0, notified: 1, skipped: 0 });
    expect(second).toEqual({ claimed: 0, failed: 0, notified: 0, skipped: 0 });
  });

  it("never hands a delivered email back to the queue when recording it fails", async () => {
    // Releasing would put the row back to pending and mail the shopper again.
    claimMock.mockResolvedValue([request()]);
    selectMock.mockReturnValue(stockRow());
    notifiedMock.mockRejectedValue(new Error("connection reset"));

    const summary = await runRestockNotifications();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 1, failed: 1, notified: 0, skipped: 0 });
    expect(logErrorMock).toHaveBeenCalledWith("restock_record_failed", {
      productId: PRODUCT_ID,
    });
  });

  it("keeps going after one row's availability check fails", async () => {
    const secondProductId = "22222222-2222-4222-8222-222222222222";
    claimMock.mockResolvedValue([
      request(),
      request({
        email: "second@example.com",
        productId: secondProductId,
        recipientEmail: "second@example.com",
      }),
    ]);
    selectMock
      .mockReturnValueOnce(failingStockRow())
      .mockReturnValueOnce(stockRow());

    const summary = await runRestockNotifications();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
      to: "second@example.com",
    });
    // Nothing was attempted for the first row, so it costs no attempt.
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      "shopper@example.com",
      CLAIMED_AT,
      { reason: "recheck_threw", retryable: false },
    );
    expect(summary).toEqual({ claimed: 2, failed: 1, notified: 1, skipped: 0 });
  });

  it("keeps going when handing a failed row back also fails", async () => {
    const secondProductId = "22222222-2222-4222-8222-222222222222";
    claimMock.mockResolvedValue([
      request(),
      request({ email: "second@example.com", productId: secondProductId }),
    ]);
    selectMock.mockReturnValue(stockRow());
    sendEmailMock
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce(true);
    releaseMock.mockRejectedValueOnce(new Error("connection reset"));

    const summary = await runRestockNotifications();

    expect(notifiedMock).toHaveBeenCalledTimes(1);
    expect(notifiedMock.mock.calls[0]?.[0]).toBe(secondProductId);
    expect(logErrorMock).toHaveBeenCalledWith("restock_release_failed", {
      productId: PRODUCT_ID,
    });
    expect(summary).toEqual({ claimed: 2, failed: 1, notified: 1, skipped: 0 });
  });

  it("does nothing when no request qualifies", async () => {
    claimMock.mockResolvedValue([]);

    const summary = await runRestockNotifications();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 0, failed: 0, notified: 0, skipped: 0 });
  });
});

describe("claiming is safe for two concurrent runs", () => {
  const queries = source("db/queries/wishlist.ts");

  /*
   * The registration's conflict clause, bounded by its own RETURNING. The file
   * has an earlier RETURNING product_id (the wishlist save), so the end must be
   * searched for after the start or the slice comes back empty.
   */
  const registrationConflictClause = () => {
    const start = queries.indexOf("ON CONFLICT (product_id, email) DO UPDATE SET");
    expect(start).toBeGreaterThan(-1);
    const end = queries.indexOf("RETURNING product_id", start);
    expect(end).toBeGreaterThan(start);
    return queries.slice(start, end);
  };

  it("claims and selects in one statement with SKIP LOCKED", () => {
    expect(queries).toContain("FOR UPDATE OF r SKIP LOCKED");
    expect(queries).toContain("SET status = 'claimed'");
  });

  it("waits for the piece to settle before anyone is told", () => {
    // A hold released and immediately retaken by the same buyer is not news.
    // The bound value is proven in wishlist-p6-04.test.ts.
    expect(queries).toContain("RESTOCK_STABILISATION_MS = 60_000");
    expect(queries).toContain("p.updated_at <= ");
  });

  it("stops retrying a request that keeps failing", () => {
    expect(queries).toContain("RESTOCK_MAX_ATTEMPTS");
    expect(queries).toContain("r.attempt_count < ");
  });

  it("recovers a crashed worker's stale claim and caps every run", () => {
    expect(queries).toContain("RESTOCK_CLAIM_LEASE_MS");
    expect(queries).toContain("r.claimed_at IS NULL OR r.claimed_at <= ");
    expect(queries).toContain("RESTOCK_MAX_CLAIM_LIMIT");
    // A late worker may only finish the exact lease it originally claimed.
    expect(queries).toContain('eq(restockNotifyRequests.claimedAt, claimedAt)');
  });

  it("keeps the existing claim index represented in schema and migration", () => {
    const schema = source("db/schema.ts");
    const migration = source("drizzle/0030_restock-notify-lifecycle.sql");

    expect(schema).toContain('index("restock_notify_requests_status_idx")');
    expect(migration).toContain(
      'CREATE INDEX IF NOT EXISTS "restock_notify_requests_status_idx"',
    );
  });

  it("does not reset a pending or claimed subscription on a repeated click", () => {
    const conflict = registrationConflictClause();

    expect(conflict).toContain(
      "WHEN existing_request.status IN ('notified', 'failed')",
    );
    for (const field of [
      "status",
      "attempt_count",
      "claimed_at",
      "last_attempt_at",
      "last_error",
      "notified_at",
      "created_at",
    ]) {
      expect(conflict).toContain(`ELSE existing_request.${field}`);
    }
    expect(conflict).not.toMatch(/status\s*=\s*'pending'/);
    expect(conflict).not.toMatch(/claimed_at\s*=\s*NULL/);
    expect(conflict).not.toMatch(/created_at\s*=\s*statement_timestamp\(\)/);
  });

  it("starts a fresh request version only after notified or failed", () => {
    const conflict = registrationConflictClause();

    expect(conflict).toContain("THEN EXCLUDED.status");
    expect(conflict).toContain("THEN EXCLUDED.attempt_count");
    expect(conflict).toContain("THEN EXCLUDED.claimed_at");
    expect(conflict).toContain("THEN EXCLUDED.last_attempt_at");
    expect(conflict).toContain("THEN EXCLUDED.last_error");
    expect(conflict).toContain("THEN EXCLUDED.notified_at");
    expect(conflict).toContain("THEN EXCLUDED.created_at");
  });
});

describe("the promise matches what happens", () => {
  it("offers the wait only where the piece can return", () => {
    const pdp = source("app/(site)/collection/[slug]/page.tsx");
    const action = source("components/cart/add-to-cart-button.tsx");
    // The PDP delegates every live state to one viewer-aware action. Sold is
    // decided before the held branch, so a sold saree can never reach Notify.
    expect(pdp).toContain("<AddToCartButton");
    expect(pdp).not.toContain("<RestockNotifyButton");

    const soldBranch = action.indexOf('if (viewerState === "sold") {');
    const heldBranch = action.indexOf(
      'if (viewerState === "reserved_by_other") {',
    );
    expect(soldBranch).toBeGreaterThan(-1);
    expect(heldBranch).toBeGreaterThan(soldBranch);
  });

  it("says email, because that is what is sent", () => {
    const button = source("components/product/restock-notify-button.tsx");
    expect(button).toContain("We'll email you if this piece becomes available.");
    expect(button).not.toContain("send you a message");
  });

  it("uses the shared OTP intent instead of collecting another email", () => {
    const button = source("components/product/restock-notify-button.tsx");
    const route = source("api/hono/routes/wishlist.ts");

    expect(button).toContain("useCommerceAuth");
    expect(button).toContain('type: "notify-me"');
    expect(button).toContain("JSON.stringify({ productId })");
    expect(button).not.toContain("restock-email");
    expect(button).not.toContain("emailSchema");
    // The account's current address from the database, never the token's copy.
    expect(route).toContain("getUserById(authUserOrResponse.id)");
    expect(route).not.toContain("authUserOrResponse.email");
    expect(route).toContain("const wishlistNotifySchema = z.object({\n  productId:");
  });

  it("sends the shopper to the bag when the piece came back mid-form", () => {
    const button = source("components/product/restock-notify-button.tsx");
    const route = source("api/hono/routes/wishlist.ts");

    expect(route).toContain('code: "PRODUCT_AVAILABLE"');
    expect(button).toContain('payload?.code === "PRODUCT_AVAILABLE"');
  });

  it("classifies a refused registration with the shared viewer verdict", () => {
    // Behaviour, including each 409 code, is proven through the route in
    // wishlist-p6-04-repairs.test.ts.
    const route = source("api/hono/routes/wishlist.ts");

    expect(route).toContain("const registered = await upsertRestockNotifyRequest");
    expect(route).toContain("if (!registered)");
    expect(route).toContain("expireCommerceHoldsForProducts(");
    expect(route).toContain("getViewerStateRows(");
    expect(route).toContain("resolveViewerState(");
  });

  it("runs the worker on a schedule", () => {
    const vercel = source("vercel.json");
    const cronRoute = source("api/hono/routes/cron.ts");
    const runtimeApp = source("api/hono/site-app.ts");
    // Reuse the existing reservation-release invocation instead of paying for
    // a second schedule. The manual protected endpoint remains available for
    // development and recovery.
    expect(vercel).toContain("/api/v2/cron/release-reservations");
    expect(vercel).not.toContain(
      '"path": "/api/v2/cron/send-restock-notifications"',
    );
    expect(cronRoute).toContain(
      "restockNotifications = await runRestockNotifications(",
    );
    expect(cronRoute).toContain('path: "/send-restock-notifications"');
    expect(runtimeApp).toContain("registerCronRoutes(cronApp)");
    expect(runtimeApp).toContain('app.route("/cron", cronApp)');
  });
});
