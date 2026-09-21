import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_SHOPPER,
  installCommerceStub,
  type CommerceStub,
} from "./support/cart-reservation-stub";

/**
 * Header cart/wishlist regression + cart value UI.
 *
 * Runs against the real storefront: the collection page's first available card
 * is added to the bag, then the drawer, badges, savings, and delivery card are
 * asserted against real catalogue data.
 *
 * WRITE SAFETY: page rendering is a database read and stays real, while the
 * authenticated server-cart API and session are intercepted by the in-memory
 * harness below. The browser still sends the production GET/POST/DELETE cart
 * requests, but the suite performs zero database writes.
 */

const cartTrigger = (page: Page) => page.locator("[data-ftt-cart-target]");
const cartBadge = (page: Page) => page.locator("[data-ftt-cart-count]");
const wishlistTrigger = (page: Page) =>
  page.locator("header [data-ftt-wishlist-target]");
const drawer = (page: Page) => page.getByRole("dialog");

/**
 * Walk the grid until a card commits. The catalogue stays real, while the
 * account-scoped cart command is handled by the in-memory server-cart harness.
 */
async function addFirstAvailableProduct(page: Page): Promise<Locator> {
  if (new URL(page.url()).pathname !== "/collection") {
    await page.goto("/collection");
  }
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
    const button = addButtons.nth(index);
    const candidateCard = button.locator(
      "xpath=ancestor::*[@data-ftt-product-card][1]",
    );
    const marker = `cart-selection-${index}`;
    await candidateCard.evaluate((node, value) => {
      node.setAttribute("data-ftt-e2e-selection", value);
    }, marker);
    const card = page.locator(`[data-ftt-e2e-selection="${marker}"]`);
    await button.click();

    // The card runs a scramble/seal/fly sequence before committing to the store.
    try {
      await expect(cartBadge(page)).toBeVisible({ timeout: 12_000 });
      return card;
    } catch {
      // A card can become unavailable while the page hydrates — try the next.
      await page.keyboard.press("Escape");
    }
  }

  throw new Error("No addable product found on the collection page");
}

/**
 * Empty the account through the same authenticated DELETE command as the UI.
 * Membership is never seeded, read, or cleared through browser storage.
 */
async function emptyTheBag(page: Page) {
  await page.evaluate(async () => {
    const response = await fetch("/api/v2/cart/items", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Unable to read the E2E server cart (${response.status}).`);
    }
    const payload = (await response.json()) as {
      items?: Array<{ productId?: string }>;
    };

    for (const item of payload.items ?? []) {
      if (!item.productId) continue;
      const removal = await fetch(
        `/api/v2/cart/items/${encodeURIComponent(item.productId)}`,
        { cache: "no-store", method: "DELETE" },
      );
      const result = (await removal.json().catch(() => null)) as {
        removed?: boolean;
      } | null;
      if (!removal.ok || result?.removed !== true) {
        throw new Error(`Unable to empty E2E cart item ${item.productId}.`);
      }
    }
  });
}

const currencyPaise = (value: string | null) => {
  const amount = Number((value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount)) throw new Error(`Invalid currency: ${value}`);
  return Math.round(amount * 100);
};

async function useSignedOutSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, json: null });
  });
}

let serverCart: CommerceStub;

// Declared before every describe-level hook, so the write endpoints are already
// intercepted by the time any test or hook navigates.
test.beforeEach(async ({ page }) => {
  // These unrelated first-visit overlays can appear while a slow local
  // catalogue request is still warming and intercept the cart click. The cart
  // suite owns neither flow, so keep its browser fixture deterministic.
  await page.addInitScript(() => {
    window.localStorage.setItem("ftt-welcome-seen-v1", "1");
    window.sessionStorage.setItem("ftt:drape-room:teaser-shown:v1", "1");
    document.cookie =
      "ftt_analytics_consent=denied; path=/; max-age=3600; SameSite=Lax";
    document.cookie =
      "ftt_drape_guide_v1=true; path=/; max-age=3600; SameSite=Lax";
  });
  // installCommerceStub is signed out by default; this suite's assertions are
  // about an account-scoped bag, so it installs as the E2E shopper.
  serverCart = await installCommerceStub(page, { account: E2E_SHOPPER });
});

test.afterEach(async ({ page }) => {
  // Every test has already reached a same-origin storefront page. Navigating
  // back through the database-backed collection solely for cleanup doubled a
  // slow local failure into a second hook timeout.
  if (page.url() === "about:blank") return;
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

    expect(serverCart.addCalls).toBe(1);
    expect(serverCart.productIds).toHaveLength(1);
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
      .getByRole("button", { name: /Remove .* from (?:your )?bag/ })
      .first()
      .click();

    await expect(cartBadge(page)).toHaveCount(0);
    await expect(cartTrigger(page)).toHaveAttribute("aria-label", "Open bag, empty");
    expect(serverCart.removeCalls).toBe(1);
    expect(serverCart.productIds).toHaveLength(0);
  });

  test("drawer removal resets that card and permits the same saree to be added again", async ({
    page,
  }) => {
    const card = await addFirstAvailableProduct(page);
    await expect(
      card.getByRole("button", { name: "In bag", exact: true }),
    ).toBeVisible();

    await drawer(page)
      .getByRole("button", { name: /Remove .* from (?:your )?bag/ })
      .first()
      .click();

    await expect(cartBadge(page)).toHaveCount(0);
    expect(serverCart.removeCalls).toBe(1);
    expect(serverCart.productIds).toHaveLength(0);

    await page.keyboard.press("Escape");
    const addAgain = card.getByRole("button", {
      name: /^\+ Cart$|^Add to bag$/,
    });
    // Shorter than ADDED_HOLD_MS (1.9s): animation state must not postpone the
    // canonical server-driven removal.
    await expect(addAgain).toBeVisible({ timeout: 1_500 });
    await expect(addAgain).toBeEnabled();
    await addAgain.click();

    await expect(cartBadge(page)).toHaveText("1", { timeout: 12_000 });
    await expect(drawer(page)).toBeVisible();
    expect(serverCart.addCalls).toBe(2);
    expect(serverCart.productIds).toHaveLength(1);
  });
});

test.describe("cart value UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/collection");
    await emptyTheBag(page);
  });

  test("shows savings and delivery in the drawer", async ({
    page,
  }) => {
    await addFirstAvailableProduct(page);
    const panel = drawer(page);

    const savings = panel.locator("[data-ftt-cart-savings]");
    await expect(savings).toBeVisible();
    await expect(savings).toContainText("You save");
    await expect(savings).toContainText("₹");
    await expect(savings.locator("svg")).toBeVisible();

    const delivery = panel.locator("[data-ftt-cart-delivery]");
    await expect(delivery).toBeVisible();
    await expect(delivery).toContainText("Estimated delivery");
    await expect(delivery).toContainText("7 to 10 days");
  });

  test("savings equals original minus current price", async ({ page }) => {
    await addFirstAvailableProduct(page);
    const ledger = drawer(page).locator("dl");
    const originalTotal = currencyPaise(
      await ledger
        .getByText("Subtotal", { exact: true })
        .locator("..")
        .locator("dd")
        .textContent(),
    );
    const savings = currencyPaise(
      await ledger
        .getByText("Savings", { exact: true })
        .locator("..")
        .locator("dd")
        .textContent(),
    );
    const currentTotal = currencyPaise(
      await ledger
        .getByText("Total", { exact: true })
        .locator("..")
        .locator("dd")
        .textContent(),
    );

    expect(savings).toBeGreaterThan(0);
    expect(originalTotal - currentTotal).toBe(savings);
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
      .getByRole("button", { name: /Remove .* from (?:your )?bag/ })
      .first()
      .click();

    await expect(page.locator("[data-ftt-cart-savings]")).toHaveCount(0);
  });
});

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await useSignedOutSession(page);
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
  test.beforeEach(async ({ page }) => {
    await useSignedOutSession(page);
  });

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

      const checkout = panel.getByRole("link", { name: /Proceed to checkout/i });
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
