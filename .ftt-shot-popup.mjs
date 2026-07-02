import { chromium } from "@playwright/test";

const OUT = "/private/tmp/claude-502/-Users-JP-Documents-codding-projects-git-fromthetrunk-website/c0e64850-9bc9-4a74-a5ef-a0eb0473c101/scratchpad";
const browser = await chromium.launch();

const sizes = [
  { name: "mobile", width: 390, height: 844 },
  { name: "ipad", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.evaluate(() => localStorage.removeItem("ftt-welcome-seen-v1"));
  await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(21000);
  // Measure whether the popup scrolls (content overflow).
  const info = await page.evaluate(() => {
    const el = document.querySelector('[role="dialog"][aria-labelledby="ftt-welcome-heading"] > div');
    if (!el) return { found: false };
    return { found: true, scrollH: el.scrollHeight, clientH: el.clientHeight, scrolls: el.scrollHeight > el.clientHeight + 1 };
  });
  console.log(s.name, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/popup-${s.name}.png` });
  await page.close();
}
await browser.close();
