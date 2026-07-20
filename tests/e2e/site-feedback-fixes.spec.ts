import { test, expect } from "@playwright/test";

test.describe("Footer social links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("Instagram link points to from.thetrunk", async ({ page }) => {
    const instagramLink = page.locator(
      'a[aria-label="Follow From the Trunk on Instagram"]'
    );
    await expect(instagramLink).toHaveAttribute(
      "href",
      "https://www.instagram.com/from.thetrunk/"
    );
  });

  test("WhatsApp link uses real number 919731910202", async ({ page }) => {
    const whatsappLink = page.locator(
      'a[aria-label="Chat with From the Trunk on WhatsApp"]'
    );
    await expect(whatsappLink).toHaveAttribute(
      "href",
      "https://wa.me/919731910202"
    );
  });
});

test.describe("Light mode only", () => {
  test("no dark mode toggle in header", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const toggle = page.locator(
      'button[aria-label*="Switch to light mode"], button[aria-label*="Switch to dark mode"]'
    );
    await expect(toggle).toHaveCount(0);
  });

  test("html element does not have dark class", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toContain("dark");
  });
});

test.describe("Our Story page content", () => {
  test("shows the current story hero and cover copy", async ({ page }) => {
    await page.goto("/our-story", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1", {
        hasText: "Our Story — Pre-Loved Sarees With Provenance",
      }),
    ).toBeAttached();
    await expect(
      page.locator("h2", { hasText: "Elegance, given a second life" }).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the book" })).toBeVisible();
  });

  test("story contents dialog lists current chapters", async ({ page }) => {
    await page.goto("/our-story", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open story contents" }).first().click();
    await expect(
      page.getByRole("dialog").getByText("Elegance, given a second life")
    ).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Never just fabric")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("The promise")).toBeVisible();
  });
});

test.describe("How It Works page content", () => {
  test("shows the 5-step process", async ({ page }) => {
    await page.goto("/how-it-works", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        name: /A second life.*handled with care/i,
        level: 1,
      })
    ).toBeAttached();
    await expect(page.locator("h3", { hasText: "Sourcing" })).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Quality Control" })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Eco-Restoration" })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Sustainable Packaging" })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Doorstep Magic" })
    ).toBeVisible();
  });
});

test.describe("Product gallery UX", () => {
  test("gallery exposes current product-image region", async ({ page }) => {
    await page.goto("/collection", { waitUntil: "domcontentloaded" });
    const firstProductLink = page.locator('a[href^="/collection/"]').first();
    await firstProductLink.scrollIntoViewIfNeeded();
    await firstProductLink.click({ timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded");
    const gallery = page.locator('section[aria-label*="product images"]').first();
    await expect(gallery).toBeVisible({ timeout: 10_000 });
    await expect(gallery.locator("img").first()).toBeVisible();
  });
});

test.describe("Mobile PDP responsiveness", () => {
  test.use({ viewport: { width: 402, height: 874 } });

  test("shows title and purchase CTA in the current mobile layout", async ({
    page,
  }) => {
    await page.goto("/collection/Kempu-Pachai-and-bandhani", {
      waitUntil: "domcontentloaded",
    });

    const title = page.locator("h1", { hasText: "Kempu Pachai" });
    const button = page.getByRole("button", { name: "Add to Bag" }).first();

    await expect(title).toBeVisible();
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  });
});

test.describe("Homepage brand teaser", () => {
  test("shows the current brand story section", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const teaser = page.getByRole("heading", {
      name: "From the Trunk: every saree still has a story left to tell.",
      level: 2,
    });
    await expect(teaser).toBeVisible();
  });
});
