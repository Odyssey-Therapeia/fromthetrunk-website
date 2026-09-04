import { expect, test, type Page } from "@playwright/test";

/**
 * Header wishlist badge.
 *
 * The wishlist is account-backed only, so the signed-in states are exercised by
 * stubbing next-auth's session route and /api/v2/wishlist. That keeps the test
 * off real credentials while still driving the real component: the same query,
 * the same dedupe, and the same cross-provider event the product buttons fire.
 */

const SESSION = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "shopper@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

const wishlistIcon = (page: Page) => page.locator("header").getByLabel(/^Wishlist,/);
const wishlistBadge = (page: Page) => wishlistIcon(page).locator("span[aria-hidden='true']");

async function stubWishlist(page: Page, ids: () => string[]) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: SESSION }),
  );
  await page.route("**/api/v2/wishlist", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ json: ids() });
  });
}

test("signed-out visitors see no count and no stale guest data", async ({ page }) => {
  await page.goto("/collection");
  await page.evaluate(() =>
    window.localStorage.setItem(
      "ftt-wishlist-guest-v1",
      JSON.stringify({ state: { productIds: ["a", "b", "c"] }, version: 1 }),
    ),
  );
  await page.reload();

  await expect(wishlistIcon(page)).toHaveAttribute("aria-label", "Wishlist, empty");
  await expect(wishlistBadge(page)).toHaveCount(0);
});

test("shows the account count and deduplicates repeated ids", async ({ page }) => {
  await stubWishlist(page, () => ["p1", "p1", "p2", "p3"]);
  await page.goto("/collection");

  await expect(wishlistBadge(page)).toHaveText("3");
  await expect(wishlistIcon(page)).toHaveAttribute(
    "aria-label",
    "Wishlist, 3 saved pieces",
  );
});

test("refreshes on a mutation raised under a different QueryClient", async ({ page }) => {
  let ids = ["p1"];
  await stubWishlist(page, () => ids);
  await page.goto("/collection");
  await expect(wishlistBadge(page)).toHaveText("1");

  const urlBefore = page.url();

  // Exactly what components/product/wishlist-button.tsx dispatches after a
  // successful save under the route-level provider tree.
  ids = ["p1", "p2"];
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("ftt:wishlist-updated", {
        detail: { reason: "add", productId: "p2" },
      }),
    ),
  );

  await expect(wishlistBadge(page)).toHaveText("2");
  expect(page.url()).toBe(urlBefore); // no full-page reload

  ids = [];
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("ftt:wishlist-updated", { detail: { reason: "remove" } }),
    ),
  );

  await expect(wishlistBadge(page)).toHaveCount(0);
  await expect(wishlistIcon(page)).toHaveAttribute("aria-label", "Wishlist, empty");
});

test("a post-login merge refreshes the header count", async ({ page }) => {
  let ids: string[] = [];
  await stubWishlist(page, () => ids);
  await page.goto("/collection");
  await expect(wishlistBadge(page)).toHaveCount(0);

  ids = ["merged-1", "merged-2"];
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("ftt:wishlist-updated", { detail: { reason: "merge" } }),
    ),
  );

  await expect(wishlistBadge(page)).toHaveText("2");
});

test("caps very large counts", async ({ page }) => {
  await stubWishlist(page, () =>
    Array.from({ length: 130 }, (_, index) => `p${index}`),
  );
  await page.goto("/collection");

  await expect(wishlistBadge(page)).toHaveText("99+");
});
