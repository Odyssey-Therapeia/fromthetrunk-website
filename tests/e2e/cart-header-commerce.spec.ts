import { expect, test, type Page } from "@playwright/test";

import { installCartReservationStub } from "./support/cart-reservation-stub";

/**
 * Header cart/wishlist regression + cart value UI.
 *
 * Runs against the real storefront: the collection page's first available card
 * is added to the bag, then the drawer, badges, savings, and delivery card are
 * asserted against real catalogue data.
 *
 * WRITE SAFETY: page rendering is a database read and stays real, but the two
 * state-changing endpoints (cart reserve/release) are intercepted by
 * installCartReservationStub below, so the suite performs zero database writes.
 * Previously it created genuine one-hour holds on live one-of-one inventory —
 * an interrupted run left real pieces unbuyable, and the suite's own results
 * depended on which pieces happened to be free.
 */

const cartTrigger = (page: Page) => page.locator("[data-ftt-cart-target]");
const cartBadge = (page: Page) => page.locator("[data-ftt-cart-count]");
const wishlistTrigger = (page: Page) =>
  page.locator("header [data-ftt-wishlist-target]");
const drawer = (page: Page) => page.getByRole("dialog");

/**
 * Pieces are one-of-one: a successful add holds the product on the server for an
 * hour. Walk the grid until a card actually commits, so a piece another test
 * already reserved (the card can still render as available from a cached page)
 * just moves us to the next one.
 */
async function addFirstAvailableProduct(page: Page) {
  await page.goto("/collection");
  await expect(cartTrigger(page)).toBeVisible();

  const addButtons = page.getByRole("button", { name: /^\+ Cart$|^Add to bag$/ });
  // The grid streams in after the shell, so `load` can fire while the page is
  // still showing skeletons. Counting straight away raced that stream and threw
  // "No addable product found" — a timing artefact, not an empty catalogue.
  // Wait for the first card to exist before deciding how many candidates there
  // are; a genuinely empty grid still fails here, just with an honest message.
  await addButtons.first().waitFor({ state: "visible", timeout: 30_000 });

  const candidates = Math.min(await addButtons.count(), 12);

  for (let index = 0; index < candidates; index += 1) {
    await addButtons.nth(index).click();

    // The card runs a scramble/seal/fly sequence before committing to the store.
    try {
      await expect(cartBadge(page)).toBeVisible({ timeout: 12_000 });
      return;
    } catch {
      // Reserved by another buyer (or an earlier test) — try the next piece.
      await page.keyboard.press("Escape");
    }
  }

  throw new Error("No addable product found on the collection page");
}

/**
 * Release the server-side hold before clearing the local cart, so the suite does
 * not burn through the catalogue's available pieces. This is the same endpoint
 * the store calls on removeItem.
 */
async function emptyTheBag(page: Page) {
  await page.evaluate(async () => {
    const raw = window.localStorage.getItem("ftt-cart-v2");
    const items = raw ? (JSON.parse(raw)?.state?.items ?? []) : [];

    for (const item of items) {
      if (!item?.reservationToken) continue;
      await fetch("/api/v2/cart/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: item.id,
          reservationToken: item.reservationToken,
        }),
      }).catch(() => undefined);
    }

    window.localStorage.removeItem("ftt-cart-v2");
  });
}

// Declared before every describe-level hook, so the write endpoints are already
// intercepted by the time any test or hook navigates.
test.beforeEach(async ({ page }) => {
  await installCartReservationStub(page);
});

test.afterEach(async ({ page }) => {
  await page.goto("/collection");
  await emptyTheBag(page);
});

test.describe("header cart control", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collection");
    await emptyTheBag(page);
  });

  test("the header cart icon is a button, not a link to /cart", async ({ page }) => {
    await page.goto("/collection");

    const trigger = cartTrigger(page);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveJSProperty("tagName", "BUTTON");
    await expect(trigger).toHaveAttribute("aria-label", "Open bag, empty");

    // No stray cart link anywhere in the header.
    const header = page.locator("header");
    await expect(header.locator('a[href="/cart"]')).toHaveCount(0);
  });

  test("no badge on an empty cart", async ({ page }) => {
    await page.goto("/collection");
    await expect(cartBadge(page)).toHaveCount(0);
  });

  test("adding shows 1, opens the drawer once, and keeps the URL", async ({ page }) => {
    await addFirstAvailableProduct(page);

    await expect(cartBadge(page)).toHaveText("1");
    await expect(drawer(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/collection");
    await expect(cartTrigger(page)).toHaveAttribute("aria-label", "Open bag, 1 item");
  });

  test("reopens from the icon and reaches /cart via View full bag", async ({ page }) => {
    await addFirstAvailableProduct(page);

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/collection");

    await cartTrigger(page).click();
    await expect(drawer(page)).toBeVisible();

    await drawer(page).getByRole("link", { name: "View full bag" }).click();
    await page.waitForURL("**/cart");
    expect(new URL(page.url()).pathname).toBe("/cart");
  });

  test("a persisted cart does not auto-open the drawer on reload", async ({ page }) => {
    await addFirstAvailableProduct(page);
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(cartBadge(page)).toHaveText("1");
    // Give the store time to hydrate and any stray effect to fire.
    await page.waitForTimeout(1_500);
    await expect(drawer(page)).toBeHidden();
  });

  test("the badge survives a reload and clears on removal", async ({ page }) => {
    await addFirstAvailableProduct(page);
    await page.reload();
    await expect(cartBadge(page)).toHaveText("1");

    await cartTrigger(page).click();
    await drawer(page)
      .getByRole("button", { name: /Remove .* from bag/ })
      .first()
      .click();

    await expect(cartBadge(page)).toHaveCount(0);
    await expect(cartTrigger(page)).toHaveAttribute("aria-label", "Open bag, empty");
  });
});

test.describe("cart value UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collection");
    await emptyTheBag(page);
  });

  test("shows the green savings banner and the delivery card in the drawer", async ({
    page,
  }) => {
    await addFirstAvailableProduct(page);
    const panel = drawer(page);

    const savings = panel.locator("[data-ftt-cart-savings]");
    await expect(savings).toBeVisible();
    await expect(savings).toContainText("saving");
    await expect(savings).toContainText("₹");
    await expect(savings).toHaveCSS("background-color", "rgb(231, 245, 236)");

    const delivery = panel.locator("[data-ftt-cart-delivery]");
    await expect(delivery).toBeVisible();
    await expect(delivery).toContainText("Estimated delivery");
    await expect(delivery).toContainText("7–10 days");
    await expect(delivery).toContainText(
      "Your order will be delivered in 7 to 10 days.",
    );
  });

  test("savings equals original minus current price", async ({ page }) => {
    await addFirstAvailableProduct(page);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("ftt-cart-v2");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.state?.items?.[0] ?? null;
    });

    expect(stored).not.toBeNull();
    // Every add-to-cart pathway must persist the catalogue original price.
    expect(typeof stored.originalPricePaise).toBe("number");

    const expected =
      stored.originalPricePaise - Math.round(stored.price * 100);
    expect(expected).toBeGreaterThan(0);

    const formatted = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(expected / 100);

    await expect(drawer(page).locator("[data-ftt-cart-savings]")).toContainText(
      formatted,
    );
  });

  test("cart page shows the banner near the top and the delivery card", async ({
    page,
  }) => {
    await addFirstAvailableProduct(page);
    await page.goto("/cart");

    const savings = page.locator("[data-ftt-cart-savings]");
    const delivery = page.locator("[data-ftt-cart-delivery]");
    await expect(savings).toBeVisible();
    await expect(delivery).toBeVisible();
    await expect(page.getByText("Original product total")).toBeVisible();
    await expect(page.getByText("Savings", { exact: true })).toBeVisible();

    // Above the item list, not buried at the bottom.
    const savingsBox = await savings.boundingBox();
    const itemsBox = await page
      .locator("article")
      .first()
      .boundingBox();
    expect(savingsBox!.y).toBeLessThan(itemsBox!.y);
  });

  test("the empty cart shows neither banner nor delivery card", async ({ page }) => {
    await page.goto("/cart");
    await emptyTheBag(page);
    await page.reload();

    await expect(page.getByText("Your bag is empty.")).toBeVisible();
    await expect(page.locator("[data-ftt-cart-savings]")).toHaveCount(0);
    await expect(page.locator("[data-ftt-cart-delivery]")).toHaveCount(0);
  });

  test("removing the item drops the savings banner", async ({ page }) => {
    await addFirstAvailableProduct(page);
    await expect(drawer(page).locator("[data-ftt-cart-savings]")).toBeVisible();

    await drawer(page)
      .getByRole("button", { name: /Remove .* from bag/ })
      .first()
      .click();

    await expect(page.locator("[data-ftt-cart-savings]")).toHaveCount(0);
  });
});

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collection");
    await emptyTheBag(page);
  });

  test("the cart trigger is keyboard operable and focus returns on close", async ({
    page,
  }) => {
    await page.goto("/collection");

    await cartTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(cartTrigger(page)).toBeFocused();
  });

  test("the drawer exposes a title and a description", async ({ page }) => {
    await page.goto("/collection");
    await cartTrigger(page).click();

    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("aria-labelledby", /.+/);
    await expect(panel).toHaveAttribute("aria-describedby", /.+/);
    await expect(panel.getByText("Shopping Bag")).toBeVisible();
  });

  test("the wishlist control is labelled for signed-out visitors", async ({ page }) => {
    await page.goto("/collection");

    const wishlist = page.locator("header").getByLabel(/^Wishlist,/);
    await expect(wishlist).toHaveAttribute("aria-label", "Wishlist, empty");
    // No stale guest count: the wishlist is account-backed only.
    await expect(wishlist.locator("[data-ftt-cart-count]")).toHaveCount(0);
    await expect(wishlist.locator("span[aria-hidden='true']")).toHaveCount(0);
  });
});

test.describe("mobile wishlist control", () => {
  test("is visible at 390px and does not collide with the cart", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/collection");

    const wishlist = wishlistTrigger(page);
    const cart = cartTrigger(page);
    await expect(wishlist).toBeVisible();
    await expect(cart).toBeVisible();

    const wishlistBox = await wishlist.boundingBox();
    const cartBox = await cart.boundingBox();
    expect(wishlistBox).not.toBeNull();
    expect(cartBox).not.toBeNull();
    expect(wishlistBox!.x + wishlistBox!.width).toBeLessThanOrEqual(cartBox!.x);
    expect(cartBox!.x + cartBox!.width).toBeLessThanOrEqual(390);
  });

  test("uses the mobile-menu link below 375px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/collection");

    await expect(wishlistTrigger(page)).toBeHidden();
    // The active header opens its menu from a <details>/<summary> disclosure
    // (components/layout/site-header-server.tsx). <summary> is NOT exposed with
    // the button role, so getByRole("button") never resolves against it — match
    // the accessible name instead.
    await page.getByLabel("Open menu").click();
    await expect(page.getByRole("link", { name: "Liked products" })).toBeVisible();
  });

  test("offers exactly one wishlist entry point at each width", async ({ page }) => {
    await page.goto("/collection");

    // Below the icon's 375px gate: icon hidden, menu link present.
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(wishlistTrigger(page)).toBeHidden();
    await page.getByLabel("Open menu").click();
    await expect(page.getByRole("link", { name: "Liked products" })).toBeVisible();
    await page.getByLabel("Open menu").click();

    // At and above 375px the icon carries the wishlist, so the menu must not
    // duplicate it. This pins the two gates together; they drifted apart once
    // (icon min-[375px], link sm:hidden) and both showed across 375–639px.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(wishlistTrigger(page)).toBeVisible();
    await page.getByLabel("Open menu").click();
    await expect(page.getByRole("link", { name: "Liked products" })).toBeHidden();
  });
});

const VIEWPORTS = [
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
  { name: "iPad portrait", width: 768, height: 1024 },
  { name: "iPad landscape", width: 1024, height: 768 },
  { name: "Laptop", width: 1366, height: 768 },
  { name: "Desktop", width: 1440, height: 900 },
];

test.describe("responsive", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/collection");
      await emptyTheBag(page);
      await addFirstAvailableProduct(page);

      const panel = drawer(page);
      await expect(panel).toBeVisible();

      // Enters from the right.
      const panelBox = (await panel.boundingBox())!;
      expect(panelBox.x + panelBox.width).toBeGreaterThanOrEqual(viewport.width - 2);

      // No horizontal overflow on the document.
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      // Badge is painted, not clipped, and clear of the neighbouring icon.
      const badgeBox = (await cartBadge(page).boundingBox())!;
      expect(badgeBox.width).toBeGreaterThan(0);
      expect(badgeBox.y).toBeGreaterThanOrEqual(0);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(viewport.width);

      // Savings, delivery, and the primary actions all fit and stay reachable.
      await expect(panel.locator("[data-ftt-cart-savings]")).toBeVisible();
      await expect(panel.locator("[data-ftt-cart-delivery]")).toBeVisible();

      const checkout = panel.getByRole("link", { name: /Proceed to Checkout/ });
      await expect(checkout).toBeInViewport();
      await expect(panel.getByRole("link", { name: "View full bag" })).toBeInViewport();

      await page.keyboard.press("Escape");
      await page.goto("/cart");
      const cartOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(cartOverflow).toBeLessThanOrEqual(1);
    });
  }
});
