"use strict";

let loginPromise;

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for authenticated Lighthouse CI runs.`);
  }
  return value;
};

module.exports = async function authenticateForLighthouse(browser, context) {
  if (loginPromise) {
    await loginPromise;
    return;
  }

  loginPromise = (async () => {
    const email = getRequiredEnv("FTT_LHCI_AUTH_EMAIL");
    const password = getRequiredEnv("FTT_LHCI_AUTH_PASSWORD");
    const origin = new URL(context.url).origin;
    const callbackPath = process.env.FTT_LHCI_AUTH_CALLBACK_PATH || "/admin";
    const signInUrl = `${origin}/account/sign-in?callbackUrl=${encodeURIComponent(
      callbackPath
    )}`;

    const page = await browser.newPage();
    try {
      await page.goto(signInUrl, { waitUntil: "networkidle0" });
      await page.waitForSelector("#email", { timeout: 15_000 });
      await page.type("#email", email);
      await page.type("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForFunction(
        () => window.location.pathname.startsWith("/admin"),
        { timeout: 20_000 }
      );
    } finally {
      await page.close();
    }
  })();

  await loginPromise;
};
