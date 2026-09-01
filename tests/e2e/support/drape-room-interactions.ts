import { expect, type Locator, type Page } from "@playwright/test";

import {
  APP_ORIGIN,
  HARNESS_PATH,
  ONBOARDING_KEY,
  PRODUCT_NAME,
  TRIGGER_NAME,
  type EntryName,
} from "./drape-room-fixtures";

export async function navigateToHarness(page: Page): Promise<void> {
  await page.goto(`${APP_ORIGIN}${HARNESS_PATH}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Drape Room E2E harness" }),
  ).toBeVisible({ timeout: 20_000 });
}

export function entryTrigger(page: Page, entryName: EntryName): Locator {
  return page
    .getByRole("region", { name: entryName })
    .getByRole("button", { name: TRIGGER_NAME, exact: true });
}

export function drapeDialog(page: Page): Locator {
  return page.getByRole("dialog", {
    name: `AI Drape Room for ${PRODUCT_NAME}`,
  });
}

export function drapeDialogSurface(page: Page): Locator {
  return page.locator(
    '[role="dialog"][aria-describedby="drape-room-description"]',
  );
}

export function onboarding(dialog: Locator): Locator {
  return dialog.locator(
    'section[aria-labelledby="drape-room-onboarding-title"]',
  );
}

export async function clearOnboardingAndReload(page: Page): Promise<void> {
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    ONBOARDING_KEY,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Drape Room E2E harness" }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function closeDrapeRoom(page: Page): Promise<void> {
  const dialog = drapeDialog(page);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const closed = await dialog
    .waitFor({ state: "hidden", timeout: 750 })
    .then(() => true)
    .catch(() => false);
  if (!closed) {
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  await expect(dialog).toBeHidden();
}

export async function expectTwoByTwoActionGrid(
  actions: Locator,
): Promise<void> {
  const viewportWidth = await actions.evaluate(() => window.innerWidth);
  const items = actions.locator("[data-drape-primary-action]");
  const boxes = await Promise.all(
    Array.from({ length: 4 }, (_, index) => requiredBox(items.nth(index))),
  );
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(3);
  expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThanOrEqual(3);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + 10);
  expect(Math.abs(boxes[0]!.x - boxes[2]!.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(boxes[1]!.x - boxes[3]!.x)).toBeLessThanOrEqual(3);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1);
  }
}

export async function assertDialogInsideViewport(
  page: Page,
  dialog: Locator,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("A fixed viewport is required for this test");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expect(async () => {
    const box = await requiredBox(dialog);
    const styles = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        bottom: style.bottom,
        height: style.height,
        maxHeight: style.maxHeight,
        position: style.position,
        top: style.top,
        transform: style.transform,
      };
    });
    const diagnostic = JSON.stringify({ box, styles, viewport });
    const computedMaxHeight = Number.parseFloat(styles.maxHeight);
    if (Number.isFinite(computedMaxHeight)) {
      expect(computedMaxHeight, diagnostic).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }
    expect(box.x, diagnostic).toBeGreaterThanOrEqual(-1);
    expect(box.y, diagnostic).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, diagnostic).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    expect(
      Math.abs(box.x + box.width / 2 - viewport.width / 2),
      diagnostic,
    ).toBeLessThanOrEqual(2);
    expect(box.y + box.height, diagnostic).toBeLessThanOrEqual(
      viewport.height + 1,
    );
  }).toPass({ timeout: 3_000 });
}

export async function assertReducedMotionStyles(
  page: Page,
  dialog: Locator,
): Promise<void> {
  await expect(dialog).toBeVisible();
  await expectReducedMotionDisabled(dialog);

  const overlay = dialog.locator("xpath=preceding-sibling::*[1]");
  await expect(overlay).toBeVisible();
  await expectReducedMotionDisabled(overlay);

  expect(
    await page.evaluate(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
}

export async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected a visible element with a bounding box");
  return box;
}

async function expectReducedMotionDisabled(locator: Locator): Promise<void> {
  const motion = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const animationNamesAreNone = style.animationName
      .split(",")
      .map((name) => name.trim())
      .every((name) => name === "none");
    const animationDurationsAreZero = style.animationDuration
      .split(",")
      .map((duration) => duration.trim())
      .every((duration) => duration === "0s" || duration === "0ms");
    const transitionDurationsAreZero = style.transitionDuration
      .split(",")
      .map((duration) => duration.trim())
      .every((duration) => duration === "0s" || duration === "0ms");
    return {
      animationDisabled: animationNamesAreNone || animationDurationsAreZero,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      transitionDisabled:
        style.transitionProperty === "none" || transitionDurationsAreZero,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  const diagnostic = JSON.stringify(motion);
  expect(motion.animationDisabled, diagnostic).toBe(true);
  expect(motion.transitionDisabled, diagnostic).toBe(true);
}
