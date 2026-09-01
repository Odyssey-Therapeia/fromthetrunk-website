import { expect, test } from "@playwright/test";

import { DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE } from "@/components/drape-room/drape-room-copy";

import {
  AI_DISCLAIMER,
  CONFIG,
  ONBOARDING_KEY,
  PRODUCT_ID,
  PRODUCT_NAME,
  PRODUCT_PATH,
  buildDrapeRoomImageFixtures,
  type DrapeRoomImageFixtures,
  type EntryName,
} from "./support/drape-room-fixtures";
import {
  assertReducedMotionStyles,
  clearOnboardingAndReload,
  closeDrapeRoom,
  assertDialogInsideViewport,
  drapeDialog,
  drapeDialogSurface,
  entryTrigger,
  navigateToHarness,
  onboarding,
} from "./support/drape-room-interactions";
import {
  hasProviderRequest,
  installNetworkHarness,
} from "./support/drape-room-network";
import {
  captureResponsiveResultScreenshots,
  expectCachedReadOnlyNavbarViewer,
  expectNoImagePayloadInLocalStorage,
  expectTransportEnvelope,
  readProtectedLocalState,
  removePhotoFromNavbar,
  replacePhotoFromNavbar,
  seedBrowserLocalDrapeRoomResults,
} from "./support/drape-room-scenarios";

let images: DrapeRoomImageFixtures;

test.beforeAll(async () => {
  images = await buildDrapeRoomImageFixtures();
  expect(images.subjectJpeg.byteLength).toBeLessThan(15 * 1024 * 1024);
  expect(images.generatedJpeg.byteLength).toBeLessThanOrEqual(3_800_000);
});

test.describe("Drape Room guarded browser flow", () => {
  test("shared card and PDP entries reveal their label and Skip works from both intro slides", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const network = await installNetworkHarness(page, images);
    await page.setViewportSize({ width: 1_280, height: 900 });
    await navigateToHarness(page);

    const cardTrigger = entryTrigger(page, "Product card entry");
    await expect(cardTrigger).toBeVisible({ timeout: 20_000 });
    const touchBox = await cardTrigger.boundingBox();
    expect(touchBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(touchBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const expandedLabel = cardTrigger.getByText("Drape Room", { exact: true });
    await cardTrigger.hover();
    await expect
      .poll(() => expandedLabel.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");
    await expect
      .poll(() => expandedLabel.evaluate((node) => node.getBoundingClientRect().width))
      .toBeGreaterThan(20);
    await page.mouse.move(0, 0);
    await expect
      .poll(() => expandedLabel.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("0");
    await cardTrigger.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(cardTrigger).toBeFocused();
    await expect
      .poll(() => expandedLabel.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");

    for (const entry of [
      "Product card entry",
      "PDP desktop entry",
      "PDP mobile sticky entry",
    ] satisfies EntryName[]) {
      await clearOnboardingAndReload(page);
      const before = page.url();
      await entryTrigger(page, entry).click();
      await expect(drapeDialog(page)).toBeVisible();
      await expect(drapeDialog(page)).toContainText(PRODUCT_NAME);
      expect(page.url()).toBe(before);
      expect(network.generateRecords).toHaveLength(0);
      await closeDrapeRoom(page);
    }

    for (let slideIndex = 0; slideIndex < 2; slideIndex += 1) {
      await clearOnboardingAndReload(page);
      await entryTrigger(page, "PDP desktop entry").click();
      const dialog = drapeDialog(page);
      const intro = onboarding(dialog);
      await expect(intro).toBeVisible();
      await expect(
        intro.locator(
          '[aria-label$="slide 1 of 3"], [aria-label$="slide 2 of 3"]',
        ),
      ).toHaveCount(2);

      for (let step = 0; step < slideIndex; step += 1) {
        await intro.getByRole("button", { name: "Next", exact: true }).click();
      }
      await expect(
        intro.getByText(`Step ${slideIndex + 1} of 3`, { exact: true }).first(),
      ).toBeVisible();
      await intro.getByRole("button", { name: "Skip", exact: true }).click();

      await expect(intro).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible();
      await expect(
        dialog.getByText("Step 3 of 3", { exact: true }).first(),
      ).toBeVisible();
      expect(network.generateRecords).toHaveLength(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toBeHidden();
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_KEY),
      )
      .not.toBeNull();
    await entryTrigger(page, "PDP desktop entry").click();
    await expect(onboarding(drapeDialog(page))).toHaveCount(0);
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);
    expect(hasProviderRequest(network.blockedExternalRequests)).toBe(false);
  });

  test("config 503 preserves first-time onboarding, local photo setup, and future direct opens", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const network = await installNetworkHarness(page, images);
    network.setConfigMode("unavailable");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await navigateToHarness(page);

    await entryTrigger(page, "Product card entry").click();
    const dialog = drapeDialog(page);
    const intro = onboarding(dialog);
    await expect(dialog).toBeVisible();
    await expect(intro).toBeVisible();
    await expect(
      intro.getByText("Step 1 of 3", { exact: true }).first(),
    ).toBeVisible();
    await expect(dialog.getByText("Drape Room is almost ready")).toHaveCount(0);
    await expect(
      dialog.getByText(/still needs its final secure setup/i),
    ).toHaveCount(0);
    await expect.poll(() => network.configRequests).toBeGreaterThan(0);
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-unavailable-onboarding-1.png",
    });

    await intro.locator('input[type="file"]').setInputFiles({
      name: "local-subject.jpg",
      mimeType: "image/jpeg",
      buffer: images.replacementJpeg,
    });
    await expect(intro.getByText(/photo ready\. review the disclosure/i)).toBeVisible({
      timeout: 30_000,
    });
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);
    await expectNoImagePayloadInLocalStorage(page);

    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      intro.getByText("Step 2 of 3", { exact: true }).first(),
    ).toBeVisible();
    await expect(intro.getByText(PRODUCT_NAME, { exact: true })).toBeVisible();
    await page.screenshot({
      path: "test-results/drape-room-unavailable-onboarding-2.png",
    });
    await intro.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      intro.getByText("Step 1 of 3", { exact: true }).first(),
    ).toBeVisible();
    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(intro).toHaveCount(0);
    await expect(
      dialog.getByText("Step 3 of 3", { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/drape-room-unavailable-onboarding-3.png",
    });

    await expect(intro).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Step 3 of 3", { exact: true }).first(),
    ).toBeVisible();
    await expect(dialog.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible();
    await expect(
      dialog.getByText(DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Provider configuration is not currently available. Generation stays off, but local photo and cached-preview tools still work.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: "Use photo and generate",
        exact: true,
      }),
    ).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_KEY),
      )
      .not.toBeNull();
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);

    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-unavailable-setup-mobile.png",
    });
    await page.setViewportSize({ width: 768, height: 1_024 });
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-unavailable-setup-tablet.png",
    });
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-unavailable-setup-desktop.png",
    });

    await closeDrapeRoom(page);
    await entryTrigger(page, "PDP desktop entry").click();
    await expect(dialog).toBeVisible();
    await expect(onboarding(dialog)).toHaveCount(0);
    await expect(dialog.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible();
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);
    expect(hasProviderRequest(network.blockedExternalRequests)).toBe(false);
  });

  test("exact cached results remain fully usable through a product star while config is 503", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const network = await installNetworkHarness(page, images);
    network.setConfigMode("unavailable");
    await page.setViewportSize({ width: 1_280, height: 900 });
    await navigateToHarness(page);

    await entryTrigger(page, "PDP desktop entry").click();
    const dialog = drapeDialog(page);
    const intro = onboarding(dialog);
    await expect(intro).toBeVisible();
    await intro.locator('input[type="file"]').setInputFiles({
      name: "cached-subject.jpg",
      mimeType: "image/jpeg",
      buffer: images.replacementJpeg,
    });
    await expect(intro.getByText(/photo ready\. review the disclosure/i)).toBeVisible({
      timeout: 30_000,
    });
    await seedBrowserLocalDrapeRoomResults(page);
    await intro.getByRole("button", { name: "Skip", exact: true }).click();
    await closeDrapeRoom(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    await entryTrigger(page, "PDP desktop entry").click();
    const resultImage = dialog.getByRole("img", {
      name: `AI preview of ${PRODUCT_NAME} in a Classic Nivi drape`,
    });
    await expect(resultImage).toBeVisible({ timeout: 20_000 });
    await expect(onboarding(dialog)).toHaveCount(0);
    await expect(
      dialog.getByText(DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE, {
        exact: true,
      }),
    ).toBeVisible();

    const actions = dialog.locator('[aria-label="Drape Room result actions"]');
    await expect(actions.locator("[data-drape-primary-action]")).toHaveCount(4);
    await expect(actions.getByText("Save image", { exact: true })).toBeVisible();
    await expect(actions.getByText("Visit product", { exact: true })).toBeVisible();
    await expect(actions.getByText("Wishlist", { exact: true })).toBeVisible();
    await expect(actions.getByText("Add to bag", { exact: true })).toBeVisible();
    await expect(dialog.locator("[data-drape-regenerate]")).toBeDisabled();
    await expect(
      dialog.locator('[data-drape-background="studio"]'),
    ).toBeEnabled();
    await expect(
      dialog.locator('[data-drape-background="festival"]'),
    ).toBeEnabled();
    for (const background of ["wedding", "party", "birthday"]) {
      await expect(
        dialog.locator(`[data-drape-background="${background}"]`),
      ).toBeDisabled();
    }

    await dialog.locator('[data-drape-background="festival"]').click();
    await expect(
      dialog.getByText("AI preview · Festival", { exact: true }),
    ).toBeVisible();
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);
    expect(hasProviderRequest(network.blockedExternalRequests)).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await actions.scrollIntoViewIfNeeded();
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-cached-503-mobile.png",
    });
    await page.setViewportSize({ width: 768, height: 1_024 });
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-cached-503-tablet.png",
    });
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await assertDialogInsideViewport(page, dialog);
    await page.screenshot({
      path: "test-results/drape-room-cached-503-desktop.png",
    });
  });

  test("reduced-motion onboarding keeps focus trapped, restores the exact trigger, and exposes exact disclosures", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const network = await installNetworkHarness(page, images);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1_024, height: 768 });
    await navigateToHarness(page);

    const trigger = entryTrigger(page, "PDP desktop entry");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = drapeDialog(page);
    const intro = onboarding(dialog);
    await expect(dialog).toBeVisible();
    await assertReducedMotionStyles(page, dialog);

    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
      ).toBe(true);
    }

    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      intro.getByText("Step 2 of 3", { exact: true }).first(),
    ).toBeVisible();
    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(intro).toHaveCount(0);
    await expect(
      dialog.getByText("Step 3 of 3", { exact: true }).first(),
    ).toBeVisible();

    const privacy = dialog.getByRole("region", {
      name: "Your photo stays under your control",
    });
    await expect(privacy).toBeVisible();
    await expect(
      privacy.getByText(`Google Gemini API · ${CONFIG.model}`, { exact: true }),
    ).toBeVisible();
    await privacy
      .getByRole("button", { name: "Privacy, provider, and data handling" })
      .click();
    await expect(
      privacy.getByText(CONFIG.providerRetentionSummary, { exact: true }),
    ).toBeVisible();
    await expect(
      privacy.getByRole("link", { name: /Read Google Gemini API’s API data policy/ }),
    ).toHaveAttribute("href", CONFIG.providerPolicyUrl);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: "Create my drape",
        exact: true,
      }),
    ).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(network.generateRecords).toHaveLength(0);
    expect(network.providerRequests).toEqual([]);
  });

  test("explicit generation survives close/reopen, caches, performs actions, preserves failed regeneration, and clears local data", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const network = await installNetworkHarness(page, images, {
      holdFirstGeneration: true,
      failGenerationNumbers: new Set([3]),
    });
    await page.setViewportSize({ width: 1_280, height: 900 });
    await navigateToHarness(page);

    const trigger = entryTrigger(page, "PDP desktop entry");
    await trigger.click();
    const dialog = drapeDialog(page);
    const intro = onboarding(dialog);
    await expect(intro).toBeVisible();
    await intro.locator('input[type="file"]').setInputFiles({
      name: "worst-case-local-subject.jpg",
      mimeType: "image/jpeg",
      buffer: images.subjectJpeg,
    });
    await expect(intro.getByText(/photo ready\. review the disclosure/i)).toBeVisible({
      timeout: 30_000,
    });
    expect(network.generateRecords).toHaveLength(0);

    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await intro.getByRole("button", { name: "Next", exact: true }).click();
    await expect(intro).toHaveCount(0);
    expect(network.generateRecords).toHaveLength(0);

    const consent = dialog.getByRole("checkbox", {
      name: /I have the right to use this photo/i,
    });
    await consent.check();
    const create = dialog.getByRole("button", {
      name: "Use photo and generate",
      exact: true,
    });
    await expect(create).toBeEnabled({ timeout: 20_000 });
    await create.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.click();
      button.click();
    });
    await expect.poll(() => network.generateRecords.length).toBe(1);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Creating your Classic Nivi preview/)).toBeVisible();
    expect(network.generateRecords).toHaveLength(1);

    network.releaseFirstGeneration();
    const resultImage = dialog.getByRole("img", {
      name: `AI preview of ${PRODUCT_NAME} in a Classic Nivi drape`,
    });
    await expect(resultImage).toBeVisible({ timeout: 30_000 });
    expect(network.generateRecords).toHaveLength(1);

    const actions = dialog.locator('[aria-label="Drape Room result actions"]');
    await expect(actions.locator("[data-drape-primary-action]")).toHaveCount(4);
    await expect(dialog.getByText(/AI preview — colour, pleats, border/)).toBeVisible();
    await dialog.getByText(/AI preview — colour, pleats, border/).click();
    await expect(dialog.getByText(AI_DISCLAIMER, { exact: true })).toBeVisible();
    await dialog.getByText(/AI preview — colour, pleats, border/).click();

    const stockGenerationCount = network.generateRecords.length;
    network.setStockStatus("reserved");
    const reservedStockRequests = network.stockRequests;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect.poll(() => network.stockRequests).toBeGreaterThan(
      reservedStockRequests,
    );
    const reservedCart = actions.getByRole("button", {
      name: "Add to cart. This saree is reserved by another buyer.",
      exact: true,
    });
    await expect(reservedCart).toBeDisabled();
    expect(network.generateRecords).toHaveLength(stockGenerationCount);

    network.setStockStatus("sold");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    await entryTrigger(page, "PDP desktop entry").click();
    await expect(resultImage).toBeVisible({ timeout: 20_000 });
    const soldStockRequests = network.stockRequests;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect.poll(() => network.stockRequests).toBeGreaterThan(
      soldStockRequests,
    );
    const soldCart = actions.getByRole("button", {
      name: "Add to cart. This one-of-one saree has sold.",
      exact: true,
    });
    await expect(soldCart).toBeDisabled();
    expect(network.generateRecords).toHaveLength(stockGenerationCount);

    network.setStockStatus("available");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    await entryTrigger(page, "PDP desktop entry").click();
    await expect(resultImage).toBeVisible({ timeout: 20_000 });
    const availableStockRequests = network.stockRequests;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect.poll(() => network.stockRequests).toBeGreaterThan(
      availableStockRequests,
    );
    await expect(
      actions.getByRole("button", { name: "Add to cart", exact: true }),
    ).toBeEnabled();
    expect(network.generateRecords).toHaveLength(stockGenerationCount);

    const downloadPromise = page.waitForEvent("download");
    await actions.getByRole("button", { name: "Save image", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "from-the-trunk-e2e-classic-nivi-saree-nivi-drape.jpg",
    );

    await actions
      .getByRole("button", { name: `Save ${PRODUCT_NAME} to wishlist` })
      .click();
    const wishlistDialog = page.getByRole("dialog", {
      name: "Save this piece to your trunk",
    });
    await expect(wishlistDialog).toBeVisible();
    await expect(drapeDialogSurface(page)).toBeVisible();
    await wishlistDialog
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(wishlistDialog).toBeHidden();
    await expect(dialog).toBeVisible();

    await actions.getByRole("button", { name: "Add to cart", exact: true }).click();
    await expect.poll(() => network.cartReserveRequests).toBe(1);
    await expect(actions.getByText("Added", { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();

    await captureResponsiveResultScreenshots({
      actions,
      dialog,
      page,
      resultImage,
    });

    await page.setViewportSize({ width: 1_280, height: 900 });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    for (const mode of ["disabled", "unavailable"] as const) {
      await expectCachedReadOnlyNavbarViewer({
        mode,
        network,
        page,
      });
    }
    network.setConfigMode("enabled");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Open Drape Room photo menu" })).toBeVisible({
      timeout: 20_000,
    });
    await entryTrigger(page, "PDP desktop entry").click();
    await expect(resultImage).toBeVisible({ timeout: 20_000 });
    await expect(onboarding(dialog)).toHaveCount(0);
    expect(network.generateRecords).toHaveLength(1);

    await dialog.getByRole("button", { name: /Festival/ }).click();
    const festivalDialog = page.getByRole("dialog", {
      name: "Create the Festival setting?",
    });
    await expect(festivalDialog).toBeVisible();
    await expect(drapeDialogSurface(page)).toBeVisible();
    await festivalDialog
      .getByRole("button", { name: "Continue and generate", exact: true })
      .click();
    await expect.poll(() => network.generateRecords.length).toBe(2);
    await expect(dialog.getByText("AI preview · Festival", { exact: true })).toBeVisible();
    await expect(festivalDialog).toBeHidden();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /Studio/ }).click();
    await expect(dialog.getByText("AI preview · Studio", { exact: true })).toBeVisible();
    expect(network.generateRecords).toHaveLength(2);

    const preservedSrc = await resultImage.getAttribute("src");
    await dialog.locator("[data-drape-regenerate]").click();
    const regenerateDialog = page.getByRole("dialog", {
      name: "Regenerate this preview?",
    });
    await expect(regenerateDialog).toBeVisible();
    await expect(drapeDialogSurface(page)).toBeVisible();
    await regenerateDialog
      .getByRole("button", { name: "Regenerate", exact: true })
      .click();
    await expect.poll(() => network.generateRecords.length).toBe(3);
    await expect(dialog.getByRole("alert")).toContainText(
      "Deterministic failed regeneration",
    );
    await expect(resultImage).toHaveAttribute("src", preservedSrc ?? "");
    await expect(
      dialog.getByText("Daily limit reached · available tomorrow", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.locator("[data-drape-regenerate]")).toBeDisabled();
    await expect(regenerateDialog).toBeHidden();
    await expect(dialog).toBeVisible();

    await actions
      .getByRole("button", { name: "Visit product", exact: true })
      .click();
    await expect.poll(() => network.productVisits).toBeGreaterThanOrEqual(1);

    await navigateToHarness(page);
    const freshTrigger = entryTrigger(page, "PDP desktop entry");
    await freshTrigger.click();
    await expect(resultImage).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();

    await replacePhotoFromNavbar(page, images.replacementJpeg);
    const photoMenu = page.getByRole("button", {
      name: "Open Drape Room photo menu",
    });

    await freshTrigger.click();
    await expect(dialog).toBeVisible();
    await expect(resultImage).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    const replacementCreate = dialog.getByRole("button", {
      name: "Daily limit reached",
      exact: true,
    });
    await expect(replacementCreate).toBeDisabled();
    expect(network.generateRecords).toHaveLength(3);
    await expect(
      dialog.getByText(/used today’s three previews for this saree/i),
    ).toBeVisible();
    await expect(resultImage).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    const preservedLocalState = await readProtectedLocalState(page);
    expect(preservedLocalState.cart).toContain(PRODUCT_ID);
    expect(preservedLocalState.consent).not.toBeNull();
    expect(preservedLocalState.onboarding).not.toBeNull();

    await removePhotoFromNavbar(page);
    await expect.poll(() => readProtectedLocalState(page)).toEqual(
      preservedLocalState,
    );
    await expectNoImagePayloadInLocalStorage(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(photoMenu).toHaveCount(0);
    await freshTrigger.click();
    await expect(dialog).toBeVisible();
    await expect(onboarding(dialog)).toHaveCount(0);
    await expect(dialog.getByText("Add your photo", { exact: true })).toBeVisible();
    await expect(resultImage).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    expect(network.generateRecords).toHaveLength(3);

    expectTransportEnvelope(
      network.generateRecords,
      images.generatedJpeg.byteLength,
    );
    expect(network.providerRequests).toEqual([]);
    expect(hasProviderRequest(network.blockedExternalRequests)).toBe(false);
  });
});
