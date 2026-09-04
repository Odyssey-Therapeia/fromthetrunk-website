import { describe, expect, it, vi } from "vitest";

import {
  DRAPE_ROOM_CONSENT_TOKEN_HEADER,
  fetchPublicTryOnConfig,
  generateDrapeRoomImage,
} from "@/lib/drape-room/client/api";
import {
  DRAPE_ROOM_CONFIG_REFRESH_MS,
  DRAPE_ROOM_CONFIG_STALE_MS,
  isDrapeRoomConfigFresh,
  millisecondsUntilDrapeRoomConfigRefresh,
} from "@/lib/drape-room/client/config-cache";
import { TRYON_CONSENT_TOKEN_TTL_MS } from "@/lib/drape-room/security/consent-token";
import type { DrapeRoomGenerateInput } from "@/lib/drape-room/client/types";

const product = {
  productId: "product-1",
  productSlug: "midnight-silk",
  productName: "Midnight Silk",
  fabric: "Silk",
  pricePaise: 1_250_000,
  stockStatus: "available" as const,
  displayImageUrl: "/media/product.webp",
  productImageId: "media-1",
  productReferenceVersion: "pdp:hash:v1",
};
const CONSENT_TOKEN = `v1.1800000000000.1800000300000.${"A".repeat(43)}`;
const PUBLIC_CONFIG = {
  enabled: true,
  provider: "google" as const,
  providerDisplayName: "Google Gemini",
  model: "gemini-3.1-flash-image",
  promptVersion: "nivi-v4",
  referenceContractVersion: "gallery-v2",
  engineVersion: "engine-v1",
  outputVersion: "jpeg-v1",
  outputMimeType: "image/jpeg" as const,
  aspectRatio: "3:4" as const,
  imageSize: "1K" as const,
  disclosureVersion: "provider-disclosure-v1",
  privacyPolicyVersion: "2026-08-ai-v1",
  providerPolicyUrl: "https://example.com/provider-policy",
  providerRetentionSummary: "The provider processes this image to create the preview.",
};

function input(): DrapeRoomGenerateInput {
  return {
    photo: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    }),
    photoDigest: "a".repeat(64),
    consentToken: CONSENT_TOKEN,
    product,
    background: "studio",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };
}

function jpegResponse(): Response {
  return new Response(
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "X-FTT-Tryon-Request-Id": "request-1",
        "X-FTT-Tryon-Provider": "google",
        "X-FTT-Tryon-Model": "gemini-3.1-flash-image",
        "X-FTT-Tryon-Prompt-Version": "nivi-v4",
        "X-FTT-Tryon-Reference-Contract-Version": "gallery-v2",
        "X-FTT-Tryon-Engine-Version": "engine-v1",
        "X-FTT-Tryon-Output-Version": "jpeg-v1",
        "X-FTT-Tryon-Product-Reference-Version": "pdp:hash:v1",
        "X-FTT-Tryon-Daily-Limit": "3",
        "X-FTT-Tryon-Daily-Used": "1",
        "X-FTT-Tryon-Daily-Remaining": "2",
        "X-FTT-Tryon-Daily-Reset-At": "2027-01-15T18:30:00.000Z",
      },
    },
  );
}

describe("Drape Room client transport", () => {
  it("keeps public config fresh for only five minutes", () => {
    const loadedAt = 10_000;
    expect(isDrapeRoomConfigFresh(loadedAt, loadedAt)).toBe(true);
    expect(
      isDrapeRoomConfigFresh(
        loadedAt,
        loadedAt + DRAPE_ROOM_CONFIG_STALE_MS - 1,
      ),
    ).toBe(true);
    expect(
      isDrapeRoomConfigFresh(
        loadedAt,
        loadedAt + DRAPE_ROOM_CONFIG_STALE_MS,
      ),
    ).toBe(false);
  });

  it("refreshes an open Drape Room before its consent token expires", () => {
    const loadedAt = 10_000;
    expect(DRAPE_ROOM_CONFIG_REFRESH_MS).toBeLessThan(
      TRYON_CONSENT_TOKEN_TTL_MS,
    );
    expect(
      millisecondsUntilDrapeRoomConfigRefresh(loadedAt, loadedAt),
    ).toBe(DRAPE_ROOM_CONFIG_REFRESH_MS);
    expect(
      millisecondsUntilDrapeRoomConfigRefresh(
        loadedAt,
        loadedAt + DRAPE_ROOM_CONFIG_REFRESH_MS - 1,
      ),
    ).toBe(1);
    expect(
      millisecondsUntilDrapeRoomConfigRefresh(
        loadedAt,
        loadedAt + DRAPE_ROOM_CONFIG_REFRESH_MS,
      ),
    ).toBe(0);
  });

  it("keeps the enabled config and its opaque consent token together in memory", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      Response.json(PUBLIC_CONFIG, {
        headers: { [DRAPE_ROOM_CONSENT_TOKEN_HEADER]: CONSENT_TOKEN },
      }),
    );

    await expect(fetchPublicTryOnConfig(fetchImpl as typeof fetch)).resolves.toEqual({
      config: PUBLIC_CONFIG,
      consentToken: CONSENT_TOKEN,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([null, "invalid-token", `${CONSENT_TOKEN}x`])(
    "fails config closed when the consent token is %s",
    async (consentToken) => {
      const headers = new Headers();
      if (consentToken) {
        headers.set(DRAPE_ROOM_CONSENT_TOKEN_HEADER, consentToken);
      }
      const fetchImpl = vi.fn(async () => Response.json(PUBLIC_CONFIG, { headers }));
      await expect(
        fetchPublicTryOnConfig(fetchImpl as typeof fetch),
      ).resolves.toBeNull();
    },
  );

  it("treats config 503 as unavailable without attempting generation", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      Response.json(
        { code: "CONFIG_UNAVAILABLE", message: "Unavailable in this test." },
        { status: 503 },
      ),
    );

    await expect(
      fetchPublicTryOnConfig(fetchImpl as typeof fetch),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/tryon/config");
    expect(fetchImpl.mock.calls.some(([url]) =>
      String(url).includes("/api/tryon/generate"),
    )).toBe(false);
  });

  it("never exposes regeneration and sends only allowed public fields", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      expect([...((form as FormData).keys())].sort()).toEqual(
        ["background", "idempotencyKey", "photo", "productId"].sort(),
      );
      expect((form as FormData).has("regeneration")).toBe(false);
      expect((form as FormData).has("provider")).toBe(false);
      expect((form as FormData).has("model")).toBe(false);
      expect((form as FormData).has("prompt")).toBe(false);
      expect(new Headers(init?.headers).get(DRAPE_ROOM_CONSENT_TOKEN_HEADER)).toBe(
        CONSENT_TOKEN,
      );
      return jpegResponse();
    });

    await expect(
      generateDrapeRoomImage(input(), fetchImpl as typeof fetch),
    ).resolves.toMatchObject({
      dailyQuota: {
        limit: 3,
        remaining: 2,
        resetAt: Date.parse("2027-01-15T18:30:00.000Z"),
        used: 1,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/tryon/generate");
  });

  it("rejects an invalid consent token before any request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      generateDrapeRoomImage(
        { ...input(), consentToken: "invalid-token" },
        fetchImpl as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces server consent precondition failures as typed client errors", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          code: "CONSENT_REQUIRED",
          message: "Refresh the disclosure before generating.",
        },
        { status: 428 },
      ),
    );
    await expect(
      generateDrapeRoomImage(input(), fetchImpl as typeof fetch),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
  });

  it("surfaces the daily product limit with authoritative quota and retry metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          code: "TRYON_PRODUCT_DAILY_LIMIT",
          message:
            "You have used today’s three previews for this saree. Your saved images remain available, and you can create more after midnight.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "3600",
            "X-FTT-Tryon-Daily-Limit": "3",
            "X-FTT-Tryon-Daily-Used": "3",
            "X-FTT-Tryon-Daily-Remaining": "0",
            "X-FTT-Tryon-Daily-Reset-At": "2027-01-15T18:30:00.000Z",
          },
        },
      ),
    );

    await expect(
      generateDrapeRoomImage(input(), fetchImpl as typeof fetch),
    ).rejects.toMatchObject({
      code: "TRYON_PRODUCT_DAILY_LIMIT",
      dailyQuota: {
        limit: 3,
        remaining: 0,
        resetAt: Date.parse("2027-01-15T18:30:00.000Z"),
        used: 3,
      },
      retryAfterSeconds: 3600,
    });
  });

  it("fails closed when success quota headers are missing or inconsistent", async () => {
    const missing = jpegResponse();
    missing.headers.delete("X-FTT-Tryon-Daily-Reset-At");
    await expect(
      generateDrapeRoomImage(
        input(),
        vi.fn(async () => missing) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "OUTPUT_INVALID" });

    const inconsistent = jpegResponse();
    inconsistent.headers.set("X-FTT-Tryon-Daily-Remaining", "1");
    await expect(
      generateDrapeRoomImage(
        input(),
        vi.fn(async () => inconsistent) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "OUTPUT_INVALID" });
  });

  it("preserves consumed quota metadata on a provider-started failure", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "PROVIDER_TIMEOUT", message: "The provider timed out." },
        {
          status: 504,
          headers: {
            "X-FTT-Tryon-Daily-Limit": "3",
            "X-FTT-Tryon-Daily-Used": "2",
            "X-FTT-Tryon-Daily-Remaining": "1",
            "X-FTT-Tryon-Daily-Reset-At": "2027-01-15T18:30:00.000Z",
          },
        },
      ),
    );

    await expect(
      generateDrapeRoomImage(input(), fetchImpl as typeof fetch),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      dailyQuota: { used: 2, remaining: 1 },
    });
  });

  it("never targets a real provider host", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      return jpegResponse();
    });
    await generateDrapeRoomImage(input(), fetchImpl as typeof fetch);
    expect(urls).toEqual(["/api/tryon/generate"]);
    expect(urls.join(" ")).not.toMatch(/googleapis|generativelanguage|api\.openai/i);
  });
});
