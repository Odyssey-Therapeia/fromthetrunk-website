import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type StockStatus = "available" | "reserved" | "sold";

type SyntheticCartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  slug: string;
  reservedUntil?: string | null;
};

const sessionFor = (label: string) => ({
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    email: `${label}@example.test`,
    id: `phase-c-${label}`,
    name: `Phase C ${label.toUpperCase()}`,
  },
});

const cartItem = (overrides: Partial<SyntheticCartItem> = {}): SyntheticCartItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  image: "",
  name: "Phase C One-of-One Saree",
  price: 15000,
  quantity: 1,
  slug: "phase-c-one-of-one-saree",
  ...overrides,
});

async function seedCart(page: Page, items: SyntheticCartItem[]) {
  await page.addInitScript((cartItems) => {
    window.localStorage.setItem(
      "ftt-cart-v2",
      JSON.stringify({
        state: { items: cartItems },
        version: 2,
      }),
    );
  }, items);
}

async function mockCheckoutBoundary({
  context,
  sessionLabel,
  stockStatus,
}: {
  context: BrowserContext;
  sessionLabel: string;
  stockStatus: StockStatus;
}) {
  await context.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify(sessionFor(sessionLabel)),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/addresses", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        body: "[]",
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ ok: true }),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/products/*/stock", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        reservedUntil:
          stockStatus === "reserved"
            ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
            : null,
        stockStatus,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function screenshotPath(testInfo: { outputPath: (name: string) => string }, name: string) {
  const dir = process.env.PHASE_C_SCREENSHOT_DIR;
  if (!dir) return testInfo.outputPath(name);

  await mkdir(dir, { recursive: true });
  return path.join(dir, name);
}

test.describe("Phase C checkout conflict UI", () => {
  test("reserved one-of-one conflict stays friendly after the final cart item is removed", async ({
    page,
  }, testInfo) => {
    await seedCart(page, [cartItem()]);
    await mockCheckoutBoundary({
      context: page.context(),
      sessionLabel: "reserved",
      stockStatus: "reserved",
    });

    await page.goto("/checkout", { waitUntil: "domcontentloaded" });

    const message = page.locator('div[aria-live="polite"]', {
      hasText: "This saree is currently reserved",
    });
    await expect(message).toBeVisible();
    await expect(message).toContainText("You have not been charged");
    await expect(message).not.toContainText("bought");
    await expect(page.getByRole("link", { name: "Explore other sarees" })).toHaveAttribute(
      "href",
      "/collection",
    );
    await expect(page.getByText("PRODUCT_RESERVED")).toHaveCount(0);
    await expect(page.getByText("409")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Proceed to payment" })).toHaveCount(0);

    await page.screenshot({
      fullPage: false,
      path: await screenshotPath(testInfo, "phase-c-reserved-conflict.png"),
    });
  });

  test("sold one-of-one conflict stays friendly and hides backend codes", async ({
    page,
  }, testInfo) => {
    await seedCart(page, [cartItem({ id: "22222222-2222-4222-8222-222222222222" })]);
    await mockCheckoutBoundary({
      context: page.context(),
      sessionLabel: "sold",
      stockStatus: "sold",
    });

    await page.goto("/checkout", { waitUntil: "domcontentloaded" });

    const message = page.locator('div[aria-live="polite"]', {
      hasText: "This saree has just been bought",
    });
    await expect(message).toBeVisible();
    await expect(message).toContainText("You have not been charged");
    await expect(page.getByRole("link", { name: "Explore other sarees" })).toHaveAttribute(
      "href",
      "/collection",
    );
    await expect(page.getByText("PRODUCT_SOLD")).toHaveCount(0);

    await page.screenshot({
      fullPage: false,
      path: await screenshotPath(testInfo, "phase-c-sold-conflict.png"),
    });
  });
});

test.describe("Phase C browser session isolation", () => {
  test("two browser contexts keep checkout sessions and carts separate", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      await mockCheckoutBoundary({
        context: contextA,
        sessionLabel: "user-a",
        stockStatus: "available",
      });
      await mockCheckoutBoundary({
        context: contextB,
        sessionLabel: "user-b",
        stockStatus: "available",
      });

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await seedCart(pageA, [
        cartItem({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Phase C User A Saree",
          slug: "phase-c-user-a-saree",
        }),
      ]);
      await seedCart(pageB, [
        cartItem({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Phase C User B Saree",
          slug: "phase-c-user-b-saree",
        }),
      ]);

      await Promise.all([
        pageA.goto("/checkout", { waitUntil: "domcontentloaded" }),
        pageB.goto("/checkout", { waitUntil: "domcontentloaded" }),
      ]);

      await expect(pageA.getByText("Phase C User A Saree")).toBeVisible();
      await expect(pageA.getByText("Phase C User B Saree")).toHaveCount(0);
      await expect(pageB.getByText("Phase C User B Saree")).toBeVisible();
      await expect(pageB.getByText("Phase C User A Saree")).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
