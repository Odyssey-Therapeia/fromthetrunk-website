import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "playwright";

import { listProducts } from "@/db/queries/products";

const baseUrl = process.env.FTT_BROWSER_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const outputDirectory = path.resolve(
  process.env.FTT_BROWSER_AUDIT_OUTPUT_DIR ?? "test-results/phase-2c-browser",
);
const defaultWidths = [360, 414, 768, 1280, 1920] as const;
const fullRoutes = [
  "/",
  "/collection",
  "/collection?fabric=silk",
  "/top-viewed",
  "/search?q=silk",
  "/account/sign-in",
  "/cart",
  "/checkout",
  "/our-story",
  "/how-it-works",
  "/packing",
  "/policies/privacy-policy",
  "/policies/terms-of-service",
  "/policies/shipping-delivery-policy",
  "/policies/return-refund-policy",
] as const;
const widths = process.env.FTT_BROWSER_AUDIT_WIDTHS
  ? process.env.FTT_BROWSER_AUDIT_WIDTHS.split(",").map((value) => {
      const width = Number.parseInt(value.trim(), 10);
      if (!Number.isInteger(width) || width < 320 || width > 3840) {
        throw new Error(`Invalid browser-audit width: ${value}`);
      }
      return width;
    })
  : [...defaultWidths];
const configuredRoutes = process.env.FTT_BROWSER_AUDIT_ROUTES
  ?.split(",")
  .map((route) => route.trim())
  .filter(Boolean);

type RequestRecord = {
  method: string;
  resourceType: string;
  url: string;
};

type FailedRequestRecord = {
  errorText: string;
  url: string;
};

type HttpErrorRecord = {
  status: number;
  url: string;
};

const sanitizeRoute = (route: string) =>
  route.replace(/^\//, "")?.replace(/[^a-z0-9]+/gi, "-") || "home";

const mediaSourceUrl = (requestUrl: string) => {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.pathname === "/_next/image") {
      return parsed.searchParams.get("url") ?? requestUrl;
    }
  } catch {
    // Keep the raw value so malformed URLs remain visible in the report.
  }
  return requestUrl;
};

const isDerivativeRequest = (requestUrl: string) =>
  mediaSourceUrl(requestUrl).includes("/media/derivatives/");

const isOriginalBlobRequest = (requestUrl: string) => {
  const sourceUrl = mediaSourceUrl(requestUrl);
  return (
    sourceUrl.includes(".public.blob.vercel-storage.com/media/") &&
    !sourceUrl.includes("/media/derivatives/")
  );
};

type ProductRouteSelection = {
  criteria: string[];
  route: string;
};

const selectProductRoutes = async (): Promise<ProductRouteSelection[]> => {
  const { rows } = await listProducts({
    includeDrafts: false,
    limit: 1_000,
    offset: 0,
  });
  const selected = new Map<string, Set<string>>();
  const add = (criteria: string, product: (typeof rows)[number] | undefined) => {
    if (!product?.slug) return;
    const route = `/collection/${product.slug}`;
    const current = selected.get(route) ?? new Set<string>();
    current.add(criteria);
    selected.set(route, current);
  };
  const uniqueImageCount = (product: (typeof rows)[number]) =>
    new Set(product.images.map((image) => image.media.url).filter(Boolean)).size;

  const oneImageProduct = rows.find((product) => uniqueImageCount(product) === 1);
  if (oneImageProduct) {
    add("one-image", oneImageProduct);
  } else {
    const minimumImageProduct = [...rows].sort(
      (a, b) => uniqueImageCount(a) - uniqueImageCount(b),
    )[0];
    add(
      `minimum-image-count:${minimumImageProduct ? uniqueImageCount(minimumImageProduct) : 0}`,
      minimumImageProduct,
    );
  }
  add("multi-image", rows.find((product) => uniqueImageCount(product) > 1));
  add(
    "available-cart-smoke",
    rows.find(
      (product) => product.stockStatus === "available" && product.typeSlug !== "blouse",
    ),
  );
  for (const host of [
    "ll1rv51y3jxrt1nr.public.blob.vercel-storage.com",
    "mgkwfyatucnr0yzo.public.blob.vercel-storage.com",
    "njufw8f4mlcjsl7g.public.blob.vercel-storage.com",
  ]) {
    add(
      `host:${host}`,
      rows.find((product) =>
        product.images.some((image) => {
          try {
            return new URL(image.media.url).hostname === host;
          } catch {
            return false;
          }
        }),
      ),
    );
  }
  add(
    "png-source",
    rows.find((product) =>
      product.images.some((image) => image.media.mimeType === "image/png"),
    ),
  );
  add(
    "largest-original",
    [...rows].sort(
      (a, b) =>
        Math.max(0, ...b.images.map((image) => image.media.filesize ?? 0)) -
        Math.max(0, ...a.images.map((image) => image.media.filesize ?? 0)),
    )[0],
  );
  return [...selected].map(([route, criteria]) => ({
    criteria: [...criteria],
    route,
  }));
};

const installPerformanceObservers = async (page: Page) => {
  await page.addInitScript(() => {
    const state = { cls: 0, lcp: null as null | Record<string, unknown> };
    Object.defineProperty(globalThis, "__fttPhase2cPerformance", {
      configurable: true,
      value: state,
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const candidate = entry as PerformanceEntry & {
          element?: Element;
          loadTime?: number;
          renderTime?: number;
          size?: number;
          url?: string;
        };
        const element = candidate.element;
        state.lcp = {
          loadTime: candidate.loadTime ?? 0,
          renderTime: candidate.renderTime ?? 0,
          selector: element
            ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
                element.classList.length
                  ? `.${Array.from(element.classList).slice(0, 3).join(".")}`
                  : ""
              }`
            : null,
          size: candidate.size ?? 0,
          startTime: candidate.startTime,
          url: candidate.url ?? null,
        };
      }
    }).observe({ buffered: true, type: "largest-contentful-paint" });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) state.cls += entry.value ?? 0;
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
};

const browserMetrics = (page: Page) =>
  page.evaluate(() => {
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          encodedBodySize: resource.encodedBodySize,
          initiatorType: resource.initiatorType,
          name: resource.name,
          transferSize: resource.transferSize,
        };
      });
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    const images = Array.from(document.images).map((image) => ({
      complete: image.complete,
      currentSrc: image.currentSrc,
      loading: image.loading,
      naturalWidth: image.naturalWidth,
    }));
    return {
      cls:
        (globalThis as typeof globalThis & {
          __fttPhase2cPerformance?: { cls: number };
        }).__fttPhase2cPerformance?.cls ?? null,
      documentBytes: navigation?.transferSize ?? 0,
      images,
      lcp:
        (globalThis as typeof globalThis & {
          __fttPhase2cPerformance?: { lcp: Record<string, unknown> | null };
        }).__fttPhase2cPerformance?.lcp ?? null,
      resources,
      videoElements: document.querySelectorAll("video").length,
    };
  });

const summarizeResources = (
  metrics: Awaited<ReturnType<typeof browserMetrics>>,
) => {
  const images = metrics.resources.filter(
    (entry) =>
      entry.initiatorType === "img" ||
      /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(entry.name),
  );
  const videos = metrics.resources.filter((entry) =>
    /\.(?:mp4|webm)(?:$|\?)/i.test(entry.name),
  );
  return {
    imageBytes: images.reduce((total, entry) => total + entry.transferSize, 0),
    imageRequests: images.length,
    mediaBytes: [...images, ...videos].reduce(
      (total, entry) => total + entry.transferSize,
      0,
    ),
    mp4Requests: videos.filter((entry) => /\.mp4(?:$|\?)/i.test(entry.name)),
    originalBlobRequests: metrics.resources.filter((entry) =>
      isOriginalBlobRequest(entry.name),
    ),
    rscRequests: metrics.resources.filter(
      (entry) => entry.name.includes("_rsc=") || entry.name.includes(".rsc"),
    ).length,
    totalBytes: metrics.resources.reduce(
      (total, entry) => total + entry.transferSize,
      metrics.documentBytes,
    ),
    totalRequests: metrics.resources.length + 1,
    videoBytes: videos.reduce((total, entry) => total + entry.transferSize, 0),
    videoRequests: videos,
  };
};

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: Array<Record<string, unknown>> = [];
  const redirectChecks: Array<Record<string, unknown>> = [];

  const requestContext = await browser.newContext().then((context) => context.request);
  for (const oldPath of [
    "/Welcoming.mp4",
    "/video/welcoming-v2.mp4",
    "/seo-candidates/welcoming-1080p-crf30-muted.mp4",
  ]) {
    const response = await requestContext.get(`${baseUrl}${oldPath}`, {
      maxRedirects: 0,
    });
    redirectChecks.push({
      location: response.headers().location ?? null,
      path: oldPath,
      status: response.status(),
    });
  }

  const productRouteSelections = await selectProductRoutes();
  const productRoutes = productRouteSelections.map((selection) => selection.route);

  for (const width of widths) {
    const routes = [...fullRoutes, ...productRoutes];
    const context = await browser.newContext({
      viewport: { height: width <= 414 ? 800 : 900, width },
    });
    const page = await context.newPage();
    await installPerformanceObservers(page);
    const requests: RequestRecord[] = [];
    const failedRequests: FailedRequestRecord[] = [];
    const httpErrors: HttpErrorRecord[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (request) => {
      requests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    });
    page.on("requestfailed", (request) =>
      failedRequests.push({
        errorText: request.failure()?.errorText ?? "unknown",
        url: request.url(),
      }),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) {
        httpErrors.push({ status: response.status(), url: response.url() });
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of configuredRoutes ?? routes) {
      for (const cacheState of ["cold", "warm"] as const) {
        process.stderr.write(
          `Auditing ${width}px ${cacheState} ${route}\n`,
        );
        const requestStart = requests.length;
        const failureStart = failedRequests.length;
        const httpErrorStart = httpErrors.length;
        const consoleStart = consoleErrors.length;
        await page.goto(`${baseUrl}${route}`, {
          timeout: 20_000,
          waitUntil: "domcontentloaded",
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(2_600);
        const initial = await browserMetrics(page);
        if (cacheState === "cold") {
          if (
            route === "/" ||
            route === "/collection" ||
            (route === productRoutes[0] && [360, 414, 1280].includes(width))
          ) {
            await page.screenshot({
              fullPage: false,
              path: path.join(
                outputDirectory,
                `${sanitizeRoute(route)}-${width}.png`,
              ),
            });
          }
          const scrollHeight = await page.evaluate(
            () => document.documentElement.scrollHeight,
          );
          for (let y = 700; y < scrollHeight; y += 700) {
            await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
            await page.waitForTimeout(80);
          }
          await page.waitForTimeout(800);
        }
        const afterScroll = await browserMetrics(page);
        const runRequests = requests.slice(requestStart);
        results.push({
          afterScroll: summarizeResources(afterScroll),
          cacheState,
          consoleErrors: consoleErrors.slice(consoleStart),
          derivativeRequests: runRequests.filter((request) =>
            isDerivativeRequest(request.url),
          ),
          failedRequests: failedRequests.slice(failureStart),
          httpErrors: httpErrors.slice(httpErrorStart),
          initial: {
            cls: initial.cls,
            lcp: initial.lcp,
            selectedImages: initial.images.filter((image) => image.currentSrc),
            ...summarizeResources(initial),
          },
          mp4Requests: runRequests.filter((request) => /\.mp4(?:$|\?)/i.test(request.url)),
          route,
          sessionRequests: runRequests.filter((request) =>
            request.url.includes("/api/auth/session"),
          ).length,
          status: await page.evaluate(() => document.readyState),
          videoElements: afterScroll.videoElements,
          width,
          wishlistRequests: runRequests.filter((request) =>
            request.url.includes("/api/v2/wishlist"),
          ).length,
        });
      }
    }
    await context.close();
  }

  let commerceSmoke: Record<string, unknown> = {
    reason: "No available non-blouse product was found.",
    status: "skipped",
  };
  const availableSelection = productRouteSelections.find((selection) =>
    selection.criteria.includes("available-cart-smoke"),
  );
  if (availableSelection) {
    const context = await browser.newContext({ viewport: { height: 800, width: 360 } });
    try {
      const page = await context.newPage();
      let reserveRequests = 0;
      let releaseRequests = 0;
      await page.route("**/api/v2/cart/reserve", async (route) => {
        reserveRequests += 1;
        await route.fulfill({
          body: JSON.stringify({
            reservationToken: "browser-audit-token",
            reservedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
          }),
          contentType: "application/json",
          status: 200,
        });
      });
      await page.route("**/api/v2/cart/release", async (route) => {
        releaseRequests += 1;
        await route.fulfill({ body: JSON.stringify({ released: true }), status: 200 });
      });
      await page.goto(`${baseUrl}${availableSelection.route}`, {
        waitUntil: "domcontentloaded",
      });
      const addButton = page.getByRole("button", { name: "Add to Bag" }).first();
      await addButton.waitFor({ state: "visible" });
      await addButton.click();
      await page.goto(`${baseUrl}/cart`, { waitUntil: "domcontentloaded" });
      const removeButton = page.getByRole("button", { name: /Remove .* from bag/ }).first();
      await removeButton.waitFor({ state: "visible" });
      const cartItemVisible = true;
      await removeButton.click();
      await page.waitForTimeout(250);
      const cartEmpty = await page
        .getByText("Your bag is empty.", { exact: true })
        .isVisible();
      commerceSmoke = {
        cartEmpty,
        cartItemVisible,
        productRoute: availableSelection.route,
        releaseRequests,
        reserveRequests,
        status: cartItemVisible && cartEmpty ? "passed" : "failed",
      };
    } catch (error) {
      commerceSmoke = {
        productRoute: availableSelection.route,
        reason: error instanceof Error ? error.message : String(error),
        status: "failed",
      };
    } finally {
      await context.close();
    }
  }

  const interactionSmoke: Record<string, unknown> = {};
  const interactionContext = await browser.newContext({
    viewport: { height: 900, width: 1280 },
  });
  try {
    const page = await interactionContext.newPage();
    await page.goto(`${baseUrl}/collection`, { waitUntil: "domcontentloaded" });
    const fabricSummary = page.locator("summary").filter({ hasText: "Fabric" }).first();
    await fabricSummary.click();
    const filterLink = page.getByRole("button", { name: /^Silk/ }).first();
    await filterLink.waitFor({ state: "visible" });
    await filterLink.focus();
    await filterLink.press("Enter");
    await page.waitForURL(/[?&]fabric=/);
    const filteredUrl = page.url();
    await page.goBack({ waitUntil: "domcontentloaded" });
    const backRestoredCollection = new URL(page.url()).pathname === "/collection";
    await page.goForward({ waitUntil: "domcontentloaded" });
    await page.waitForURL(/[?&]fabric=/);
    const forwardUrl = page.url();
    const forwardRestoredFilter = forwardUrl === filteredUrl;

    const multiImageSelection = productRouteSelections.find((selection) =>
      selection.criteria.includes("multi-image"),
    );
    let pdpImageSwitch = "skipped";
    if (multiImageSelection) {
      await page.goto(`${baseUrl}${multiImageSelection.route}`, {
        waitUntil: "domcontentloaded",
      });
      const secondImage = page.getByRole("button", { name: /View image 2 of/ });
      await secondImage.waitFor({ state: "visible" });
      await secondImage.focus();
      await secondImage.press("Enter");
      pdpImageSwitch =
        (await secondImage.getAttribute("aria-pressed")) === "true"
          ? "passed"
          : "failed";
    }
    Object.assign(interactionSmoke, {
      backRestoredCollection,
      filterKeyboardNavigation: filteredUrl.includes("fabric="),
      filteredUrl,
      forwardRestoredFilter,
      forwardUrl,
      pdpImageSwitch,
      status:
        backRestoredCollection &&
        forwardRestoredFilter &&
        filteredUrl.includes("fabric=") &&
        pdpImageSwitch === "passed"
          ? "passed"
          : "failed",
    });
  } catch (error) {
    Object.assign(interactionSmoke, {
      reason: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
  } finally {
    await interactionContext.close();
  }

  await requestContext.dispose();
  await browser.close();
  const report = {
    baseUrl,
    commerceSmoke,
    generatedAt: new Date().toISOString(),
    interactionSmoke,
    productRouteSelections,
    productRoutes,
    redirectChecks,
    results,
  };
  await writeFile(
    path.join(outputDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({
      abortedRequests: results.reduce(
        (count, result) =>
          count +
          (result.failedRequests as FailedRequestRecord[]).filter(
            (request) => request.errorText === "net::ERR_ABORTED",
          ).length,
        0,
      ),
      failures: results.reduce(
        (count, result) =>
          count +
          (result.failedRequests as FailedRequestRecord[]).filter(
            (request) => request.errorText !== "net::ERR_ABORTED",
          ).length,
        0,
      ),
      httpErrors: results.reduce(
        (count, result) => count + (result.httpErrors as HttpErrorRecord[]).length,
        0,
      ),
      mp4Requests: results.reduce(
        (count, result) => count + (result.mp4Requests as RequestRecord[]).length,
        0,
      ),
      outputDirectory,
      commerceSmoke,
      interactionSmoke,
      productRouteSelections,
      productRoutes,
      redirectChecks,
      runs: results.length,
    }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : "Browser audit failed."}\n`,
  );
  process.exitCode = 1;
});
