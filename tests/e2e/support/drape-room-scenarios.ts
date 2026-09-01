import { expect, type Locator, type Page } from "@playwright/test";

import {
  CART_KEY,
  CONFIG,
  CONSENT_TOKEN,
  CONSENT_KEY,
  ONBOARDING_KEY,
  PRODUCT_ID,
  PRODUCT_NAME,
  RESULT_REFERENCE_VERSION,
} from "./drape-room-fixtures";
import {
  assertDialogInsideViewport,
  expectTwoByTwoActionGrid,
  requiredBox,
} from "./drape-room-interactions";
import {
  multipartField,
  type ConfigMode,
  type GenerateRecord,
  type NetworkHarness,
} from "./drape-room-network";

export type ProtectedLocalState = {
  cart: null | string;
  consent: null | string;
  onboarding: null | string;
};

export async function expectCachedReadOnlyNavbarViewer({
  mode,
  network,
  page,
}: {
  mode: Exclude<ConfigMode, "enabled">;
  network: NetworkHarness;
  page: Page;
}): Promise<void> {
  const generationCount = network.generateRecords.length;
  const providerCount = network.providerRequests.length;
  const configRequestCount = network.configRequests;
  network.setConfigMode(mode);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Drape Room E2E harness" }),
  ).toBeVisible({ timeout: 20_000 });
  expect(network.configRequests).toBe(configRequestCount);

  const photoMenu = page.getByRole("button", {
    name: "Open Drape Room photo menu",
  });
  await expect(photoMenu).toBeVisible();
  await photoMenu.click();
  const menuOptions = page.getByRole("button", {
    name: /^(View current photo|Replace photo|Remove photo|Open Drape Room)$/,
  });
  await expect(menuOptions).toHaveCount(4);
  for (const name of [
    "View current photo",
    "Replace photo",
    "Remove photo",
    "Open Drape Room",
  ]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }

  await page
    .getByRole("button", { name: "Open Drape Room", exact: true })
    .click();
  const configRequestsBeforeOpen = network.configRequests;
  const dialog = page.getByRole("dialog", {
    name: "Saved Drape Room previews",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Browser-local · Read only", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "This saved-preview view is read-only. Existing previews stay available only in this browser. To create another, choose Drape Room on an eligible saree when generation is available.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("img", {
      name: `Saved AI preview of ${PRODUCT_NAME} in a Classic Nivi drape`,
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    dialog.getByRole("button", { name: /^(Save image|Visit product)$/ }),
  ).toHaveCount(2);
  await expect(dialog.locator("[data-drape-regenerate]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: /^(Create my drape|Use photo and generate|Regenerate)$/i,
    }),
  ).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(network.configRequests).toBe(configRequestsBeforeOpen);
  expect(network.generateRecords).toHaveLength(generationCount);
  expect(network.providerRequests).toHaveLength(providerCount);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function captureResponsiveResultScreenshots({
  actions,
  dialog,
  page,
  resultImage,
}: {
  actions: Locator;
  dialog: Locator;
  page: Page;
  resultImage: Locator;
}): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await actions.scrollIntoViewIfNeeded();
  await expectTwoByTwoActionGrid(actions);
  await expect(actions.locator("xpath=..")).toHaveCSS("position", "sticky");
  await assertDialogInsideViewport(page, dialog);
  await expectNoDialogHorizontalOverflow(dialog);
  await page.screenshot({ path: "test-results/drape-room-mobile.png" });

  await page.setViewportSize({ width: 430, height: 932 });
  await actions.scrollIntoViewIfNeeded();
  await expectTwoByTwoActionGrid(actions);
  await expect(actions.locator("xpath=..")).toHaveCSS("position", "sticky");
  await assertDialogInsideViewport(page, dialog);
  await expectNoDialogHorizontalOverflow(dialog);
  await page.screenshot({ path: "test-results/drape-room-mobile-wide.png" });

  await page.setViewportSize({ width: 768, height: 1_024 });
  await expect(actions.locator("xpath=..")).toHaveCSS("position", "sticky");
  await assertDialogInsideViewport(page, dialog);
  await expectNoDialogHorizontalOverflow(dialog);
  await page.screenshot({
    path: "test-results/drape-room-tablet-portrait.png",
  });

  await page.setViewportSize({ width: 1_024, height: 768 });
  await assertDialogInsideViewport(page, dialog);
  await expect(actions.locator("xpath=..")).toHaveCSS("position", "static");
  const landscapeImageBox = await requiredBox(resultImage);
  const landscapeActionBox = await requiredBox(actions);
  expect(landscapeActionBox.x).toBeGreaterThan(
    landscapeImageBox.x + landscapeImageBox.width - 20,
  );
  await expectNoDialogHorizontalOverflow(dialog);
  await page.screenshot({
    path: "test-results/drape-room-tablet-landscape.png",
  });

  await page.setViewportSize({ width: 1_366, height: 768 });
  await assertDialogInsideViewport(page, dialog);
  await expect(actions.locator("xpath=..")).toHaveCSS("position", "static");
  await expectNoDialogHorizontalOverflow(dialog);
  await page.screenshot({ path: "test-results/drape-room-desktop-1366.png" });

  await page.setViewportSize({ width: 1_440, height: 900 });
  await assertDialogInsideViewport(page, dialog);
  await expectNoDialogHorizontalOverflow(dialog);
  await resultImage.scrollIntoViewIfNeeded();
  const imageBox = await requiredBox(resultImage);
  const actionBox = await requiredBox(actions);
  expect(actionBox.x).toBeGreaterThan(imageBox.x + imageBox.width - 20);
  await page.screenshot({ path: "test-results/drape-room-desktop.png" });
}

async function expectNoDialogHorizontalOverflow(dialog: Locator): Promise<void> {
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
}

export async function replacePhotoFromNavbar(
  page: Page,
  replacementJpeg: Buffer,
): Promise<void> {
  const photoMenu = page.getByRole("button", {
    name: "Open Drape Room photo menu",
  });
  await expect(photoMenu).toBeVisible();
  const originalAvatarSrc = await photoMenu
    .getByRole("img", { name: "Your Drape Room photo" })
    .getAttribute("src");

  await photoMenu.click();
  await page.getByRole("button", { name: "Replace photo", exact: true }).click();
  const replaceDialog = page.getByRole("dialog", { name: "Replace your photo?" });
  await expect(replaceDialog).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await replaceDialog
    .getByRole("button", { name: "Choose new photo", exact: true })
    .click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "replacement-subject.jpg",
    mimeType: "image/jpeg",
    buffer: replacementJpeg,
  });
  await expect
    .poll(() =>
      photoMenu
        .getByRole("img", { name: "Your Drape Room photo" })
        .getAttribute("src"),
      { timeout: 30_000 },
    )
    .not.toBe(originalAvatarSrc);
}

export async function removePhotoFromNavbar(page: Page): Promise<void> {
  const photoMenu = page.getByRole("button", {
    name: "Open Drape Room photo menu",
  });
  await photoMenu.click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  const removeDialog = page.getByRole("dialog", { name: "Remove photo?" });
  await expect(removeDialog).toBeVisible();
  await removeDialog
    .getByRole("button", { name: "Remove photo", exact: true })
    .click();
  await expect(photoMenu).toHaveCount(0);
}

export async function readProtectedLocalState(
  page: Page,
): Promise<ProtectedLocalState> {
  return page.evaluate(
    ({ cartKey, consentKey, onboardingKey }) => ({
      cart: window.localStorage.getItem(cartKey),
      consent: window.localStorage.getItem(consentKey),
      onboarding: window.localStorage.getItem(onboardingKey),
    }),
    {
      cartKey: CART_KEY,
      consentKey: CONSENT_KEY,
      onboardingKey: ONBOARDING_KEY,
    },
  );
}

export async function expectNoImagePayloadInLocalStorage(
  page: Page,
): Promise<void> {
  expect(
    await page.evaluate(() => {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        const value = key ? window.localStorage.getItem(key) : null;
        if (value && /data:image|base64,/i.test(value)) return true;
      }
      return false;
    }),
  ).toBe(false);
}

export async function seedBrowserLocalDrapeRoomResults(
  page: Page,
  backgrounds: readonly ("studio" | "festival")[] = [
    "studio",
    "festival",
  ],
): Promise<void> {
  await page.evaluate(
    async ({ backgrounds, config, productId, productName, referenceVersion }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("ftt_drape_room_v1", 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () =>
          reject(new Error("Drape Room storage was not initialized."));
        request.onsuccess = () => resolve(request.result);
      });
      const photo = await new Promise<Record<string, unknown> | undefined>(
        (resolve, reject) => {
          const transaction = database.transaction("photos", "readonly");
          const request = transaction.objectStore("photos").get("user_photo");
          request.onerror = () => reject(request.error);
          request.onsuccess = () =>
            resolve(request.result as Record<string, unknown> | undefined);
        },
      );
      if (!photo || typeof photo.digest !== "string") {
        database.close();
        throw new Error("The browser-local user_photo record was missing.");
      }
      const response = await fetch(
        "/_next/image?url=%2FFtt_logo_navbar.avif&w=1080&q=75",
      );
      const blob = await response.blob();
      const transaction = database.transaction("renders", "readwrite");
      const store = transaction.objectStore("renders");
      const now = Date.now();
      backgrounds.forEach((background, index) => {
        store.put({
          cacheKey: `tryon:${String(index + 1).repeat(64)}`,
          blob,
          mimeType: "image/jpeg",
          width: 1_024,
          height: 1_365,
          byteSize: blob.size,
          userPhotoDigest: photo.digest,
          productId,
          productSlug: "e2e-classic-nivi-saree",
          productName,
          productReferenceVersion: referenceVersion,
          drape: "nivi",
          background,
          provider: config.provider,
          model: config.model,
          promptVersion: config.promptVersion,
          engineVersion: config.engineVersion,
          outputVersion: config.outputVersion,
          createdAt: now + index,
          lastViewedAt: now + index,
        });
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    {
      backgrounds,
      config: CONFIG,
      productId: PRODUCT_ID,
      productName: PRODUCT_NAME,
      referenceVersion: RESULT_REFERENCE_VERSION,
    },
  );
}

export function expectTransportEnvelope(
  records: readonly GenerateRecord[],
  generatedImageBytes: number,
): void {
  expect(CONSENT_TOKEN).toHaveLength(74);
  expect(CONSENT_TOKEN).toMatch(
    /^v1\.\d{13}\.\d{13}\.[A-Za-z0-9_-]{43}$/,
  );
  expect(records).toHaveLength(3);
  expect(multipartField(records[0]!.bytes, "background")).toBe("studio");
  expect(multipartField(records[1]!.bytes, "background")).toBe("festival");
  expect(records[0]!.text).not.toContain('name="regeneration"');
  expect(records[1]!.text).not.toContain('name="regeneration"');
  expect(multipartField(records[2]!.bytes, "background")).toBe("studio");
  expect(multipartField(records[2]!.bytes, "regeneration")).toBe("true");

  for (const record of records) {
    expect(record.consentToken).toBe(CONSENT_TOKEN);
    expect(multipartField(record.bytes, "productId")).toBe(PRODUCT_ID);
    expect(record.text).toContain('name="photo"; filename="photo.jpg"');
    expect(record.photoBytes).toBeLessThanOrEqual(2_000_000);
    expect(record.bytes.byteLength).toBeLessThanOrEqual(3_500_000);
    for (const forbiddenField of [
      "provider",
      "model",
      "prompt",
      "productImageUrl",
      "drape",
      "notes",
    ]) {
      expect(record.text).not.toContain(`name="${forbiddenField}"`);
    }
  }

  const idempotencyKeys = records.map((record) =>
    multipartField(record.bytes, "idempotencyKey"),
  );
  expect(new Set(idempotencyKeys).size).toBe(records.length);
  expect(generatedImageBytes).toBeLessThanOrEqual(3_800_000);
  expect(
    Math.max(
      generatedImageBytes,
      ...records.map((record) => record.bytes.byteLength),
    ),
  ).toBeLessThan(4_500_000);
}
