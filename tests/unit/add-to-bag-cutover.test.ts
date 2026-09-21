/**
 * Add to Bag, after the cutover to the authenticated server bag.
 *
 * Ownership no longer lives in the browser. The button hands a signed-out
 * shopper to the one commerce popup, the server claims the saree and records
 * who holds it in a single statement, and removal finishes before the UI will
 * offer the piece again.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("the add button", () => {
  const row = source("components/product/product-card-commerce-row.tsx");

  it("sends a signed-out shopper through the shared popup", () => {
    expect(row).toContain("commerceAuth.requireAuth");
    expect(row).toContain('type: "add-to-cart"');
    // It raises no dialog of its own; that is the coordinator's job alone.
    expect(row).not.toContain("DialogContent");
  });

  it("adds immediately for a signed-in shopper", () => {
    expect(row).toContain("serverCart.addToBag({");
    expect(row).toContain("if (commerceAuth && !serverCart.isAuthenticated)");
  });

  it("waits for server confirmation before starting the existing motion", () => {
    const flow = row.slice(
      row.indexOf("const runAddToCartFlow"),
      row.indexOf("runAddFlowRef.current = runAddToCartFlow"),
    );
    expect(flow.indexOf("await serverCart.addToBag")).toBeGreaterThan(-1);
    expect(flow.indexOf('setState("scrambling")')).toBeGreaterThan(
      flow.indexOf("await serverCart.addToBag"),
    );
    expect(flow.match(/serverCart\.addToBag/g)).toHaveLength(1);
    expect(flow).toContain("addRequestInFlightRef.current");
  });

  it("stores no reservation proof in the browser", () => {
    // The local line is presentational only — name, price, image.
    const addCall = row.slice(row.indexOf("addItem({"), row.indexOf("trackWebsiteMetric"));
    expect(addCall).not.toContain("reservationToken");
    expect(addCall).not.toContain("reservedUntil");
  });

  it("will not re-add while a release is still travelling", () => {
    // isInBag is the one answer to "already theirs?" — label, trash control
    // and this guard all read it, so they cannot disagree.
    expect(row).toMatch(/isUnavailable\s*\|\|\s*isInBag\s*\|\|\s*isReleasing/);
    expect(row).toContain("serverCart.isReleasing");
    expect(row).toMatch(/disabled=\{\s*isUnavailable \|\|\s*isInBag \|\|\s*isReleasing/);
  });

  it("offers three actions and nothing else", () => {
    expect(row).not.toContain("Complete payment");
    // A saree mid-payment is still in the bag; checkout finishes payments.
    expect(row).toContain('canonicalViewerState === "payment_pending"');
    // Only the shopper's own live hold offers the trash. Keyed on "not sold",
    // it showed beside a payment in progress. Rendered proof per state lives
    // in commerce-surface-states.test.tsx.
    expect(row).toContain(
      'showSteadyInBag && canonicalViewerState === "in_my_cart"',
    );
    expect(row).not.toContain('showSteadyInBag && viewerState !== "sold"');
  });

  it("takes the server verdict as final, with no bag-row override", () => {
    expect(row).toContain("const canonicalViewerState = viewer.state;");
    for (const file of [
      "components/product/product-card-commerce-row.tsx",
      "components/product/product-card.tsx",
      "components/cart/add-to-cart-button.tsx",
    ]) {
      expect(source(file)).not.toContain("reconcileViewerStateWithServerCart");
    }
  });
});

describe("removal", () => {
  const row = source("components/product/product-card-commerce-row.tsx");
  const hook = source("lib/commerce/use-server-cart.ts");

  it("waits for the server before the row goes", () => {
    expect(row).toContain("serverCart.removeFromBag");
    expect(row).toContain("if (!result.ok)");
  });

  it("keeps the piece in the bag when the request fails", () => {
    // Dropping it would strand a live hold with nobody able to release it.
    const removal = hook.slice(hook.indexOf("const removeFromBag"));
    const refuseStart = removal.indexOf("const refuse = (");
    const failureStart = removal.indexOf("if (!response.ok) {");
    const successCheck = removal.indexOf("if (payload?.removed !== true)");
    expect(refuseStart).toBeGreaterThan(-1);
    expect(failureStart).toBeGreaterThan(refuseStart);
    expect(successCheck).toBeGreaterThan(failureStart);

    expect(removal.slice(refuseStart, failureStart)).toContain("ok: false");
    const failure = removal.slice(failureStart, successCheck);
    expect(failure).toContain("await refresh();");
    expect(failure).toContain("return refusal;");
    // The cached line is dropped only after a proven removal, never here.
    expect(failure).not.toContain("setQueryData");
    expect(row).toContain("Could not release this saree");
  });

  it("marks the piece as releasing for the whole round trip", () => {
    expect(hook).toContain("setReleasing(productId, true)");
    expect(hook).toContain("setReleasing(productId, false)");
    expect(hook).toContain("finally");
  });

  it("does not let the successful-add animation outlive canonical removal", () => {
    expect(row).toContain("const canonicalIsInBag =");
    expect(row).toContain(
      'state === "added" && !canonicalIsInBag ? "idle" : state',
    );
    expect(row).toContain('effectiveState !== "idle"');
  });
});

describe("no inert controls", () => {
  const row = source("components/product/product-card-commerce-row.tsx");

  it("gives every control the same answer to \"already theirs?\"", () => {
    /*
     * The label and the trash read isInBag while the remove handler and the
     * disabled prop still read inCart — two different sources. Whenever they
     * disagreed the card showed "In bag" with a trash and an enabled button,
     * and clicking either did nothing at all. The remove guard and the trash
     * now both read the in_my_cart verdict, so a payment in progress offers
     * neither.
     */
    expect(row).toContain('if (canonicalViewerState !== "in_my_cart") return;');
    expect(row).toContain("isUnavailable ||");
    expect(row).toContain("isInBag ||");
    expect(row).toContain(
      'showSteadyInBag && canonicalViewerState === "in_my_cart"',
    );
    expect(row).not.toContain("if (!inCart) return;");
    expect(row).not.toContain("if (!isInBag) return;");
  });

  it("does not offer a saree the server rendered as held", () => {
    // Seeding a reserved piece as available let the card offer it, with the
    // full add animation, until the batched verdict answered — or forever if
    // that request failed.
    expect(row).toContain('staticStatus === "reserved"');
    expect(row).toContain('? "reserved_by_other"');
  });
});

describe("a refusal is not a removal", () => {
  const hook = source("lib/commerce/use-server-cart.ts");
  const route = source("api/hono/routes/cart.ts");
  const query = source("db/queries/user-cart.ts");

  it("says outright whether the line went", () => {
    // The server answers 200 for a refusal too. Reading the status code alone
    // told the shopper their saree was gone while the server still held it
    // and a live payment link was outstanding against it.
    expect(route).toContain("removed: result.removed");
    // Inverted deliberately: a body without `removed` at all is a refusal too,
    // so success has to be proven rather than merely not disproven.
    expect(hook).toContain("payload?.removed !== true");
  });

  it("keeps the line when a payment is open against the piece", () => {
    expect(query).toContain("payment_hold AS MATERIALIZED");
    expect(query).toContain('"PAYMENT_IN_PROGRESS"');
    expect(query).toContain("paymentHoldActive && !removed");
  });

  it("tells the shopper why, rather than failing silently", () => {
    for (const file of [
      "components/product/product-card-commerce-row.tsx",
      "components/cart/cart-item.tsx",
    ]) {
      expect(source(file)).toContain("This saree has a payment in progress");
    }
  });
});

describe("the drawer's trash", () => {
  const item = source("components/cart/cart-item.tsx");

  it("removes on the server, which owns the bag", () => {
    /*
     * It used to call the local store's removeItem, whose release needs a
     * signed token. Rows synced down from the account carry none, so that
     * path returned early without sending a request: the line vanished
     * locally, the server row survived, and a refresh brought it back.
     */
    expect(item).toContain("removeFromBag(item.id)");
    expect(item).not.toContain("removeItem(item.id)");
  });

  it("keeps the line when the server refuses", () => {
    expect(item).toContain("if (result.ok)");
    expect(item).toContain("Could not release this saree");
  });
});

describe("the server bag", () => {
  const hook = source("lib/commerce/use-server-cart.ts");
  const route = source("api/hono/routes/cart.ts");

  it("loads from the account, so a refresh keeps the bag", () => {
    expect(hook).toContain('fetch("/api/v2/cart/items"');
    expect(route).toContain('path: "/items"');
    expect(route).toContain("listUserCartItems");
  });

  it("sweeps lapsed holds before answering, with no cron", () => {
    const handler = route.slice(route.indexOf("The signed-in shopper's bag"));
    expect(handler.slice(0, 2_000)).toContain("expireCommerceHoldsForProducts");
  });

  it("refuses to answer without a session", () => {
    const handler = route.slice(route.indexOf("The signed-in shopper's bag"));
    expect(handler.slice(0, 1_200)).toContain("requireAuth(c)");
  });

  it("refreshes the verdicts every card renders after a change", () => {
    // The batched poller re-asks on this event, so the call that refetches
    // the bag also refreshes every card's verdict.
    const refresh = hook.slice(
      hook.indexOf("const refresh = useCallback"),
      hook.indexOf("const addMutation"),
    );
    expect(refresh).toContain('new CustomEvent("ftt:cart-updated")');
    expect(refresh).toContain("queryKey: serverCartKey(userId)");
    expect(source("lib/realtime/use-collection-stock.tsx")).toContain(
      'window.addEventListener("ftt:cart-updated"',
    );
  });
});

describe("replay after sign-in", () => {
  const runners = source("components/commerce/commerce-intent-runners.tsx");
  const row = source("components/product/product-card-commerce-row.tsx");

  it("performs the add the shopper originally clicked", () => {
    expect(runners).toContain('"add-to-cart"');
    expect(runners).toContain("replayAddToBagAtOrigin(intent)");
    expect(runners).toContain("addToBag(");
    expect(row).toContain("subscribeToAddToBagReplay");
    expect(row).toContain("runAddFlowRef.current(addButtonRef.current, true)");
  });

  it("says so plainly when the saree went while they signed in", () => {
    expect(runners).toContain("getAvailabilityErrorMessage(result.code)");
  });
});

describe("the release identity check is untouched", () => {
  const query = source("db/queries/user-cart.ts");

  it("still matches the cart token and expiry exactly", () => {
    // A tolerance here would free a saree carrying a live payment link.
    expect(query).toContain("locked.cart_reservation_token = ${reservationToken");
    expect(query).toContain("locked.cart_reserved_until = ${reservedUntil");
    expect(query).toContain(
      "product.reserved_until = locked.cart_reserved_until",
    );
  });

  it("never releases the exact current payment hold, and only that hold protects", () => {
    // Every condition of the current hold, so a historical pending order for
    // this saree can never block the shopper's removal.
    const holdStart = query.indexOf("payment_hold AS MATERIALIZED (");
    const holdEnd = query.indexOf(") AS active", holdStart);
    expect(holdStart).toBeGreaterThan(-1);
    expect(holdEnd).toBeGreaterThan(holdStart);
    const hold = query.slice(holdStart, holdEnd);
    for (const condition of [
      "orders.user_id = ${userId}::uuid",
      "orders.payment_status = 'pending'",
      "reservations.product_id = ${productId}::uuid",
      "reservations.expires_at = locked.product_reserved_until",
      "locked.product_stock_status = 'reserved'",
      "locked.cart_status = 'payment_pending'",
      "locked.cart_reserved_until = locked.product_reserved_until",
    ]) {
      expect(hold).toContain(condition);
    }
    expect(query).toContain("AND payment_hold.active = FALSE");
    expect(query).toContain('"payment_pending"');
  });
});
