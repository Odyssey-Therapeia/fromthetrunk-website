import { config as loadEnv } from "dotenv";
import { encode } from "next-auth/jwt";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

loadEnv({ path: ".env.local", quiet: true });

type AccountLabel = "user-a" | "user-b";

const sessionFor = (label: AccountLabel) => ({
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    email: `phase-d-${label}@example.test`,
    id: `phase-d-${label}`,
    name: `Phase D ${label.toUpperCase()}`,
  },
});

const orderFor = (label: AccountLabel) => ({
  createdAt: "2026-07-03T09:00:00.000Z",
  id: `phase-d-${label}-order`,
  items: [
    {
      id: `phase-d-${label}-item`,
      name: `Phase D ${label.toUpperCase()} Order Saree`,
      pricePaise: label === "user-a" ? 111100 : 222200,
      quantity: 1,
      selectedOptions: null,
    },
  ],
  paymentStatus: "paid",
  placedAt: "2026-07-03T09:00:00.000Z",
  status: "confirmed",
  totalPaise: label === "user-a" ? 111100 : 222200,
});

const addressFor = (label: AccountLabel) => ({
  city: "Mumbai",
  country: "India",
  createdAt: "2026-07-03T09:00:00.000Z",
  id: `phase-d-${label}-address`,
  isDefault: true,
  label: `Phase D ${label.toUpperCase()} Address`,
  line1: `${label === "user-a" ? "A" : "B"} Isolation Lane`,
  line2: "",
  name: `Phase D ${label.toUpperCase()}`,
  phone: "phase-d-redacted-phone",
  postalCode: "400001",
  state: "Maharashtra",
  updatedAt: "2026-07-03T09:00:00.000Z",
  userId: `phase-d-${label}`,
});

const productFor = (label: AccountLabel) => ({
  collections: [],
  createdAt: "2026-07-03T09:00:00.000Z",
  detailsFabric: "Silk",
  id: `phase-d-${label}-product`,
  images: [],
  metadata: null,
  name: `Phase D ${label.toUpperCase()} Wishlist Saree`,
  originalPricePaise: null,
  pricePaise: label === "user-a" ? 333300 : 444400,
  slug: `phase-d-${label}-wishlist-saree`,
  status: "published",
  stockStatus: "available",
  storyTitle: "Synthetic isolation proof",
  updatedAt: "2026-07-03T09:00:00.000Z",
});

async function mockAccountApis(context: BrowserContext, label: AccountLabel) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for the Phase D auth-session smoke.");
  }
  const sessionToken = await encode({
    maxAge: 60 * 60,
    secret,
    token: {
      email: `phase-d-${label}@example.test`,
      name: `Phase D ${label.toUpperCase()}`,
      role: "customer",
      sub: `phase-d-${label}`,
    },
  });
  await context.addCookies([
    {
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      secure: false,
      url: "http://localhost:3000",
      value: sessionToken,
    },
  ]);

  await context.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify(sessionFor(label)),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/orders", async (route) => {
    await route.fulfill({
      body: JSON.stringify([orderFor(label)]),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/addresses", async (route) => {
    await route.fulfill({
      body: JSON.stringify([addressFor(label)]),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/wishlist", async (route) => {
    await route.fulfill({
      body: JSON.stringify([`phase-d-${label}-product`]),
      contentType: "application/json",
      status: 200,
    });
  });

  await context.route("**/api/v2/products?**", async (route) => {
    await route.fulfill({
      body: JSON.stringify([productFor(label)]),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function gotoAccountPage(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!String(error).includes("net::ERR_ABORTED")) {
      throw error;
    }
    await page.goto(path, { waitUntil: "domcontentloaded" });
  }
}

test.describe("Phase D account session isolation", () => {
  test("two browser contexts keep account orders, addresses, and wishlist data isolated", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      await mockAccountApis(contextA, "user-a");
      await mockAccountApis(contextB, "user-b");

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await Promise.all([
        gotoAccountPage(pageA, "/account/orders"),
        gotoAccountPage(pageB, "/account/orders"),
      ]);
      await expect(pageA.getByText("Phase D USER-A Order Saree")).toBeVisible();
      await expect(pageA.getByText("Phase D USER-B Order Saree")).toHaveCount(0);
      await expect(pageB.getByText("Phase D USER-B Order Saree")).toBeVisible();
      await expect(pageB.getByText("Phase D USER-A Order Saree")).toHaveCount(0);

      await Promise.all([
        gotoAccountPage(pageA, "/account/addresses"),
        gotoAccountPage(pageB, "/account/addresses"),
      ]);
      await expect(pageA.getByText("Phase D USER-A Address")).toBeVisible();
      await expect(pageA.getByText("B Isolation Lane")).toHaveCount(0);
      await expect(pageB.getByText("Phase D USER-B Address")).toBeVisible();
      await expect(pageB.getByText("A Isolation Lane")).toHaveCount(0);

      await Promise.all([
        gotoAccountPage(pageA, "/account/wishlist"),
        gotoAccountPage(pageB, "/account/wishlist"),
      ]);
      await expect(pageA.getByText("Phase D USER-A Wishlist Saree")).toBeVisible();
      await expect(pageA.getByText("Phase D USER-B Wishlist Saree")).toHaveCount(0);
      await expect(pageB.getByText("Phase D USER-B Wishlist Saree")).toBeVisible();
      await expect(pageB.getByText("Phase D USER-A Wishlist Saree")).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
