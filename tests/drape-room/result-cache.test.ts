import { describe, expect, it } from "vitest";

import {
  createDrapeRoomCacheNamespaceIdentity,
  isCurrentDrapeRoomResult,
  isDrapeRoomCacheLookupSettled,
  isDrapeRoomRequestContextCurrent,
  selectBrowserLocalDrapeRoomResults,
} from "@/components/drape-room/drape-room-result-cache";
import type { DrapeRoomResult } from "@/components/drape-room/types";
import type {
  StoredDrapeRender,
  StoredUserPhoto,
} from "@/lib/drape-room/client/storage";
import type { PublicTryOnConfig } from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";

const config: PublicTryOnConfig = {
  enabled: true,
  provider: "google",
  providerDisplayName: "Google Gemini API",
  model: "image-model-v1",
  promptVersion: "prompt-v1",
  engineVersion: "engine-v1",
  outputVersion: "output-v1",
  outputMimeType: "image/jpeg",
  aspectRatio: "3:4",
  imageSize: "1K",
  disclosureVersion: "disclosure-v1",
  privacyPolicyVersion: "privacy-v1",
  providerPolicyUrl: "https://example.com/provider-policy",
  providerRetentionSummary: "Test retention summary.",
};

const product: DrapeSaree = {
  productId: "product-a",
  productSlug: "product-a",
  productName: "Product A",
  fabric: "Silk",
  pricePaise: 100_000,
  stockStatus: "available",
  displayImageUrl: "/product-a.jpg",
  productImageId: "image-a",
  productReferenceVersion: "reference-a",
};

const photo: StoredUserPhoto = {
  key: "user_photo",
  blob: new Blob(["photo"], { type: "image/jpeg" }),
  mimeType: "image/jpeg",
  width: 900,
  height: 1_200,
  byteSize: 5,
  digest: "a".repeat(64),
  createdAt: 1,
  updatedAt: 1,
};

const result: DrapeRoomResult = {
  cacheKey: `tryon:${"b".repeat(64)}`,
  blob: new Blob(["result"], { type: "image/jpeg" }),
  previewUrl: "blob:result-a",
  userPhotoDigest: photo.digest,
  productId: product.productId,
  productReferenceVersion: product.productReferenceVersion,
  background: "studio",
  provider: config.provider,
  model: config.model,
  promptVersion: config.promptVersion,
  engineVersion: config.engineVersion,
  outputVersion: config.outputVersion,
  createdAt: 2,
};

function storedRender(
  overrides: Partial<StoredDrapeRender> = {},
): StoredDrapeRender {
  return {
    cacheKey: `tryon:${"b".repeat(64)}`,
    blob: new Blob(["result"], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    width: 1_024,
    height: 1_365,
    byteSize: 6,
    userPhotoDigest: photo.digest,
    productId: product.productId,
    productSlug: product.productSlug,
    productName: product.productName,
    productReferenceVersion: product.productReferenceVersion,
    drape: "nivi",
    background: "studio",
    provider: config.provider,
    model: config.model,
    promptVersion: config.promptVersion,
    engineVersion: config.engineVersion,
    outputVersion: config.outputVersion,
    createdAt: 2,
    lastViewedAt: 2,
    ...overrides,
  };
}

describe("Drape Room result identity guards", () => {
  it("settles cache lookup only for the exact current namespace identity", () => {
    const identity = createDrapeRoomCacheNamespaceIdentity({
      photo,
      product,
      config,
    });
    expect(isDrapeRoomCacheLookupSettled(identity, identity)).toBe(true);
    expect(isDrapeRoomCacheLookupSettled(identity, null)).toBe(false);
    expect(
      createDrapeRoomCacheNamespaceIdentity({
        photo,
        product: { ...product, productReferenceVersion: "reference-b" },
        config,
      }),
    ).not.toBe(identity);
    expect(
      createDrapeRoomCacheNamespaceIdentity({
        photo,
        product,
        config: { ...config, model: "image-model-v2" },
      }),
    ).not.toBe(identity);
  });

  it("shows only a result matching the full current photo/product/config identity", () => {
    expect(
      isCurrentDrapeRoomResult({
        result,
        photo,
        product,
        config,
        background: "studio",
      }),
    ).toBe(true);

    expect(
      isCurrentDrapeRoomResult({
        result,
        photo,
        product: { ...product, productId: "product-b" },
        config,
        background: "studio",
      }),
    ).toBe(false);
    expect(
      isCurrentDrapeRoomResult({
        result,
        photo: { ...photo, digest: "c".repeat(64) },
        product,
        config,
        background: "studio",
      }),
    ).toBe(false);
    expect(
      isCurrentDrapeRoomResult({
        result,
        photo,
        product,
        config: { ...config, model: "image-model-v2" },
        background: "studio",
      }),
    ).toBe(false);
  });

  it("validates exact browser-local identity without requiring live config", () => {
    expect(
      isCurrentDrapeRoomResult({
        result: { ...result, model: "older-browser-model" },
        photo,
        product,
        config: null,
        background: "studio",
      }),
    ).toBe(true);
    expect(
      isCurrentDrapeRoomResult({
        result: { ...result, productReferenceVersion: "wrong-reference" },
        photo,
        product,
        config: null,
        background: "studio",
      }),
    ).toBe(false);
  });

  it("selects one newest coherent cached namespace and never crosses identities", () => {
    const selected = selectBrowserLocalDrapeRoomResults(
      [
        storedRender({
          cacheKey: `tryon:${"1".repeat(64)}`,
          background: "wedding",
          model: "older-model",
          lastViewedAt: 10,
        }),
        storedRender({
          cacheKey: `tryon:${"2".repeat(64)}`,
          background: "festival",
          model: "newer-model",
          lastViewedAt: 20,
        }),
        storedRender({
          cacheKey: `tryon:${"3".repeat(64)}`,
          background: "studio",
          model: "newer-model",
          lastViewedAt: 30,
        }),
        storedRender({
          cacheKey: `tryon:${"4".repeat(64)}`,
          background: "party",
          productId: "wrong-product",
          model: "newer-model",
          lastViewedAt: 40,
        }),
        storedRender({
          cacheKey: `tryon:${"5".repeat(64)}`,
          background: "birthday",
          userPhotoDigest: "c".repeat(64),
          model: "newer-model",
          lastViewedAt: 50,
        }),
      ],
      photo,
      product,
    );

    expect(selected.map(({ background }) => background)).toEqual([
      "studio",
      "festival",
    ]);
    expect(new Set(selected.map(({ model }) => model))).toEqual(
      new Set(["newer-model"]),
    );
  });

  it("rejects a settled request after its photo revision or product changes", () => {
    const current = {
      expectedRequestId: "request-a",
      expectedPhotoRevision: 4,
      expectedProductId: "product-a",
      activeRequestId: "request-a",
      photoRevision: 4,
      selectedProductId: "product-a",
    };
    expect(isDrapeRoomRequestContextCurrent(current)).toBe(true);
    expect(
      isDrapeRoomRequestContextCurrent({ ...current, photoRevision: 5 }),
    ).toBe(false);
    expect(
      isDrapeRoomRequestContextCurrent({
        ...current,
        selectedProductId: "product-b",
      }),
    ).toBe(false);
    expect(
      isDrapeRoomRequestContextCurrent({
        ...current,
        activeRequestId: null,
      }),
    ).toBe(false);
  });
});
