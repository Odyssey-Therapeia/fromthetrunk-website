import { join } from "node:path";

import type { Locator, Page, TestInfo } from "@playwright/test";

import {
  SEARCH_QUERY,
  VISUAL_RUN_LABEL,
  expect,
  expectElementScreenshot,
  expectRegionScreenshot,
  firstRowMembers,
  hasResolvedSlugs,
  loadOrResolveSlugs,
  measureCommerceRowOverflow,
  openPage,
  productCardBySlug,
  productCards,
  settle,
  slugOfCard,
  test,
  writeArtifact,
  type VisualSlugs,
} from "./support/visual-fixtures";

/**
 * REQUIRED TEST 20 — "desktop and mobile UI remain visually unchanged".
 *
 * DESIGN rule under test: no visual redesign. Existing card, cart, drawer,
 * animation, typography and colour classes stay; only state logic,
 * disabled/hidden controls, overflow defects and responsive containment may
 * change.
 *
 * Run it with playwright.visual.config.ts, first against the pre-change code
 * with --update-snapshots (BEFORE), then against the changed code (AFTER).
 * Every test is signed out, runs at desktop-1280 and mobile-390, and compares
 * the same pieces in both runs (slugs.json). Overflow facts are recorded as
 * JSON, not asserted as pixels. See tests/e2e/support/visual-fixtures.ts for
 * the determinism and read-only guarantees.
 */

async function slugsFor(page: Page, testInfo: TestInfo): Promise<VisualSlugs> {
  test.slow(!hasResolvedSlugs(), "Resolving slugs.json browses /collection and /search first.");
  return loadOrResolveSlugs(page, testInfo);
}

/** A row region only means something if it holds the recorded pieces. */
async function expectRecordedOrder(
  members: Locator[],
  recorded: string[],
  where: string,
): Promise<void> {
  const live: string[] = [];
  for (const member of members) live.push(await slugOfCard(member));
  expect(
    live,
    `${where} no longer starts with the pieces recorded in slugs.json, so its row region is not comparable (catalogue drift, not a UI change).`,
  ).toEqual(recorded.slice(0, live.length));
}

async function capturePdpPurchaseBlock(
  page: Page,
  testInfo: TestInfo,
  kind: "available" | "sold",
  slug: string,
): Promise<void> {
  await openPage(page, `/collection/${slug}`);

  // The streamed dossier <aside>; the loading skeleton's aside has no <h1>.
  const dossier = page.locator("aside:has(h1)").first();
  await expectElementScreenshot(page, dossier, `pdp-${kind}-${slug}-dossier`);

  // Add to bag / wishlist / Drape trigger and the availability notice.
  const purchaseControls = dossier.locator("div.space-y-2\\.5").first();
  await expectElementScreenshot(page, purchaseControls, `pdp-${kind}-${slug}-purchase-controls`);

  if (testInfo.project.use.isMobile) {
    // The md:hidden fixed purchase bar that only exists on small screens. Its
    // background is 96% opaque over a backdrop blur, so whatever scrolls
    // behind it bleeds through faintly. Capturing from the top of the page
    // pins that backdrop to this piece's own gallery image in every run,
    // instead of wherever the previous capture happened to leave the scroll.
    await page.evaluate(() => window.scrollTo(0, 0));
    const stickyBar = page
      .locator("div.fixed.inset-x-0.bottom-0")
      .filter({ has: page.locator("p.truncate") })
      .first();
    await expectElementScreenshot(page, stickyBar, `pdp-${kind}-${slug}-sticky-bar`);
  }
}

test.describe("UI invariance, signed out", () => {
  test("collection grid: first row region", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    await openPage(page, "/collection");
    const members = await firstRowMembers(page);
    await expectRecordedOrder(members, slugs.collectionOrder, "/collection");
    testInfo.annotations.push({ type: "collection-first-row", description: `${members.length} cards` });
    await expectRegionScreenshot(page, members, "collection-first-row");
  });

  test("collection grid: first four cards", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    await openPage(page, "/collection");
    for (const slug of slugs.collectionCards) {
      await expectElementScreenshot(page, productCardBySlug(page, slug), `collection-card-${slug}`);
    }
  });

  test("collection grid: reserved card", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    const slug = slugs.reservedCard;
    test.skip(!slug, slugs.notes.find((note) => note.includes('"Reserved"')) ?? "No reserved card.");
    if (!slug) return;
    await openPage(page, "/collection");
    await expectElementScreenshot(page, productCardBySlug(page, slug), `collection-reserved-card-${slug}`);
  });

  test("collection grid: sold card", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    const slug = slugs.soldCard;
    test.skip(!slug, slugs.notes.find((note) => note.includes('"Sold out"')) ?? "No sold card.");
    if (!slug) return;
    await openPage(page, "/collection");
    await expectElementScreenshot(page, productCardBySlug(page, slug), `collection-sold-card-${slug}`);
  });

  test("pdp: purchase block of an available saree", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    const slug = slugs.pdpAvailable;
    test.skip(!slug, "No available saree was found on /collection.");
    if (!slug) return;
    await capturePdpPurchaseBlock(page, testInfo, "available", slug);
  });

  test("pdp: purchase block of a sold saree", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    const slug = slugs.pdpSold;
    test.skip(!slug, slugs.notes.find((note) => note.includes('"Sold out"')) ?? "No sold saree.");
    if (!slug) return;
    await capturePdpPurchaseBlock(page, testInfo, "sold", slug);
  });

  test("header: commerce controls", async ({ page }) => {
    await openPage(page, "/collection");
    await page.evaluate(() => window.scrollTo(0, 0));

    const cart = page.locator("header [data-ftt-cart-target]").first();
    const wishlist = page.locator("header [data-ftt-wishlist-target]").first();
    await expect(cart).toBeVisible({ timeout: 60_000 });
    await expect(wishlist).toBeVisible();

    // The icon row that holds both controls (search, Drape photo, account,
    // wishlist, cart, menu). Found structurally so no class name is assumed.
    await cart.evaluate((node) => {
      let row = node.parentElement;
      while (row && !row.querySelector("[data-ftt-wishlist-target]")) row = row.parentElement;
      row?.setAttribute("data-ftt-visual-target", "header-commerce-row");
    });
    const iconRow = page.locator('[data-ftt-visual-target="header-commerce-row"]').first();

    await expectElementScreenshot(page, iconRow, "header-commerce-row");
    await expectElementScreenshot(page, wishlist, "header-wishlist-control");
    await expectElementScreenshot(page, cart, "header-cart-control");
  });

  test("search: result grid cards", async ({ page }, testInfo) => {
    const slugs = await slugsFor(page, testInfo);
    await openPage(page, `/search?q=${encodeURIComponent(slugs.searchQuery)}`);

    const members = await firstRowMembers(page);
    await expectRecordedOrder(members, slugs.searchOrder, `/search?q=${slugs.searchQuery}`);
    testInfo.annotations.push({ type: "search-columns", description: String(members.length) });
    if (testInfo.project.use.isMobile) {
      expect(members.length, "search results must remain a two-column grid on mobile").toBe(2);
    }

    await expectRegionScreenshot(page, members, "search-first-row");
    for (const slug of slugs.searchCards) {
      await expectElementScreenshot(page, productCardBySlug(page, slug), `search-card-${slug}`);
    }
  });

  for (const target of [
    { key: "collection", path: "/collection" },
    { key: "search", path: `/search?q=${encodeURIComponent(SEARCH_QUERY)}` },
  ]) {
    test(`overflow facts: ${target.path}`, async ({ page }, testInfo) => {
      await openPage(page, target.path);
      const cards = productCards(page);
      await settle(page, cards.first());
      await settle(page, cards.last());

      const facts = await measureCommerceRowOverflow(page);
      const file = writeArtifact(
        join("overflow", VISUAL_RUN_LABEL, `${testInfo.project.name}-${target.key}.json`),
        {
          baseURL: testInfo.project.use.baseURL,
          label: VISUAL_RUN_LABEL,
          measuredAt: new Date().toISOString(),
          project: testInfo.project.name,
          ...facts,
        },
      );
      await testInfo.attach(`overflow-${target.key}.json`, {
        contentType: "application/json",
        path: file,
      });

      const { summary } = facts;
      console.log(
        `[ui-invariance] ${VISUAL_RUN_LABEL} ${testInfo.project.name} ${target.path}: ` +
          `document overflowX=${facts.document.overflowX}px; ` +
          `rows overflowing ${summary.rowsOverflowing}/${summary.rowsMeasured}; ` +
          `pills overflowing ${summary.pillsOverflowing}/${summary.pills} ` +
          `(visibly spilling ${summary.pillsVisiblySpilling}, clipped ${summary.pillsClipped}, ` +
          `multi-line ${summary.pillsMultiLine}, outside card ${summary.pillsOutsideCard}, ` +
          `under the buttons ${summary.pillsCollidingWithButtons})`,
      );

      // A recorded fact, not a pixel assertion: it only proves rows were found.
      expect(summary.rowsMeasured, "no product card commerce rows were found to measure").toBeGreaterThan(0);
    });
  }
});
