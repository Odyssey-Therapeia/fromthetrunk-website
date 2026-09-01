import type { Page } from "@playwright/test";

import {
  APP_ORIGIN,
  CONFIG,
  CONSENT_TOKEN,
  PRODUCT_ID,
  PRODUCT_NAME,
  PRODUCT_PATH,
  RESULT_REFERENCE_VERSION,
  type DrapeRoomImageFixtures,
} from "./drape-room-fixtures";

export type StockStatus = "available" | "reserved" | "sold";
export type ConfigMode = "disabled" | "enabled" | "unavailable";

export type GenerateRecord = {
  bytes: Buffer;
  consentToken: string | null;
  photoBytes: number;
  text: string;
};

type NetworkOptions = {
  failGenerationNumbers?: ReadonlySet<number>;
  holdFirstGeneration?: boolean;
};

export type NetworkHarness = {
  blockedExternalRequests: string[];
  readonly cartReserveRequests: number;
  readonly configRequests: number;
  generateRecords: GenerateRecord[];
  readonly productVisits: number;
  providerRequests: string[];
  releaseFirstGeneration: () => void;
  setConfigMode: (mode: ConfigMode) => void;
  setStockStatus: (status: StockStatus) => void;
  readonly stockRequests: number;
};

export async function installNetworkHarness(
  page: Page,
  images: DrapeRoomImageFixtures,
  options: NetworkOptions = {},
): Promise<NetworkHarness> {
  const appOrigin = new URL(APP_ORIGIN).origin;
  const generateRecords: GenerateRecord[] = [];
  const providerRequests: string[] = [];
  const blockedExternalRequests: string[] = [];
  let configRequests = 0;
  let cartReserveRequests = 0;
  let productVisits = 0;
  let stockRequests = 0;
  let configMode: ConfigMode = "enabled";
  let stockStatus: StockStatus = "available";
  let releaseGate = () => {};
  const firstGenerationGate = options.holdFirstGeneration
    ? new Promise<void>((resolve) => {
        releaseGate = resolve;
      })
    : Promise.resolve();

  await page.context().addCookies([
    {
      name: "ftt_analytics_consent",
      value: "denied",
      url: APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isProviderHost(url.hostname)) providerRequests.push(request.url());
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isAppRequest = url.origin === appOrigin;

    if (isAppRequest && url.pathname === "/api/tryon/config") {
      configRequests += 1;
      if (configMode === "unavailable") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "Cache-Control": "no-store" },
          body: JSON.stringify({
            code: "CONFIG_UNAVAILABLE",
            message: "Deterministic unavailable configuration.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Cache-Control": "no-store",
          "X-FTT-Tryon-Consent-Token": CONSENT_TOKEN,
        },
        body: JSON.stringify({
          ...CONFIG,
          enabled: configMode === "enabled",
        }),
      });
      return;
    }

    if (isAppRequest && url.pathname === "/api/tryon/generate") {
      const body = request.postDataBuffer();
      if (!body) throw new Error("Drape Room request had no multipart body");
      const requestNumber = generateRecords.length + 1;
      generateRecords.push({
        bytes: body,
        consentToken:
          request.headers()["x-ftt-tryon-consent-token"] ?? null,
        photoBytes: multipartFileByteSize(body, "photo"),
        text: body.toString("latin1"),
      });

      if (requestNumber === 1 && options.holdFirstGeneration) {
        await firstGenerationGate;
      }
      if (options.failGenerationNumbers?.has(requestNumber)) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: dailyQuotaHeaders(requestNumber),
          body: JSON.stringify({
            code: "PROVIDER_UNAVAILABLE",
            message:
              "Deterministic failed regeneration; the previous image is kept.",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "image/jpeg",
          "X-Content-Type-Options": "nosniff",
          "X-FTT-Tryon-Request-Id": `e2e-request-${requestNumber
            .toString()
            .padStart(4, "0")}`,
          "X-FTT-Tryon-Provider": CONFIG.provider,
          "X-FTT-Tryon-Model": CONFIG.model,
          "X-FTT-Tryon-Prompt-Version": CONFIG.promptVersion,
          "X-FTT-Tryon-Engine-Version": CONFIG.engineVersion,
          "X-FTT-Tryon-Output-Version": CONFIG.outputVersion,
          "X-FTT-Tryon-Product-Reference-Version": RESULT_REFERENCE_VERSION,
          ...dailyQuotaHeaders(requestNumber),
        },
        body: images.generatedJpeg,
      });
      return;
    }

    if (isAppRequest && url.pathname.startsWith("/api/auth/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }

    if (isAppRequest && url.pathname === "/api/v2/cart/reserve") {
      cartReserveRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reservationToken: "e2e-local-reservation",
          reservedUntil: "2099-01-01T00:00:00.000Z",
        }),
      });
      return;
    }

    if (
      isAppRequest &&
      url.pathname.startsWith("/api/v2/products/") &&
      url.pathname.endsWith("/stock")
    ) {
      stockRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: PRODUCT_ID,
          stockStatus,
          reservedUntil:
            stockStatus === "reserved" ? "2099-01-01T00:00:00.000Z" : null,
        }),
      });
      return;
    }

    if (isAppRequest && url.pathname === "/api/v2/security/csp-report") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (isAppRequest && url.pathname === PRODUCT_PATH) {
      productVisits += 1;
      if (!request.isNavigationRequest()) {
        await route.fulfill({
          status: 204,
          contentType: "text/x-component",
          body: "",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><title>${PRODUCT_NAME}</title></head><body><h1>${PRODUCT_NAME}</h1></body></html>`,
      });
      return;
    }

    if (isAppRequest && url.pathname === "/_next/image") {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: images.subjectJpeg,
      });
      return;
    }

    if (isAppRequest) {
      await route.continue();
      return;
    }

    blockedExternalRequests.push(request.url());
    if (request.resourceType() === "image") {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: images.subjectJpeg,
      });
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });

  return {
    blockedExternalRequests,
    get cartReserveRequests() {
      return cartReserveRequests;
    },
    get configRequests() {
      return configRequests;
    },
    generateRecords,
    get productVisits() {
      return productVisits;
    },
    providerRequests,
    releaseFirstGeneration: () => releaseGate(),
    setConfigMode: (mode) => {
      configMode = mode;
    },
    setStockStatus: (nextStatus) => {
      stockStatus = nextStatus;
    },
    get stockRequests() {
      return stockRequests;
    },
  };
}

function dailyQuotaHeaders(usedValue: number): Record<string, string> {
  const used = Math.max(0, Math.min(3, usedValue));
  const now = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1_000;
  const shifted = new Date(now + istOffsetMs);
  const resetAt =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1,
    ) - istOffsetMs;
  return {
    "X-FTT-Tryon-Daily-Limit": "3",
    "X-FTT-Tryon-Daily-Used": String(used),
    "X-FTT-Tryon-Daily-Remaining": String(3 - used),
    "X-FTT-Tryon-Daily-Reset-At": new Date(resetAt).toISOString(),
  };
}

export function multipartField(body: Buffer, name: string): string {
  const match = body
    .toString("latin1")
    .match(new RegExp(`name="${escapeRegExp(name)}"\\r\\n\\r\\n([^\\r\\n]+)`));
  if (!match?.[1]) throw new Error(`Multipart field ${name} was missing`);
  return match[1];
}

export function hasProviderRequest(urls: readonly string[]): boolean {
  return urls.some((url) => isProviderHost(new URL(url).hostname));
}

function multipartFileByteSize(body: Buffer, name: string): number {
  const text = body.toString("latin1");
  const firstLineEnd = text.indexOf("\r\n");
  const boundary = text.slice(0, firstLineEnd);
  const header = `name="${name}"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const headerIndex = text.indexOf(header);
  if (firstLineEnd < 0 || !boundary || headerIndex < 0) {
    throw new Error(`Multipart file ${name} was missing`);
  }
  const start = headerIndex + header.length;
  const end = text.indexOf(`\r\n${boundary}`, start);
  if (end < start) throw new Error(`Multipart file ${name} had no boundary`);
  return end - start;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "api.openai.com" ||
    host === "api.anthropic.com" ||
    host === "generativelanguage.googleapis.com" ||
    host.endsWith(".googleapis.com") ||
    host.endsWith(".openai.com") ||
    host.endsWith(".anthropic.com")
  );
}
