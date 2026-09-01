import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import {
  projectDrapeRoomEntry,
  projectDrapeSaree,
  resolveDrapeProductReferences,
} from "@/lib/drape-room/product";

const mediaHost = "njufw8f4mlcjsl7g.public.blob.vercel-storage.com";
const approvedUrl = `https://${mediaHost}/media/derivatives/pdp.webp`;

const makeProduct = (
  overrides: Partial<ProductWithRelations> = {},
): ProductWithRelations =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    slug: "gold-zari-saree",
    name: "Gold Zari Saree",
    status: "published",
    stockStatus: "available",
    reservedUntil: null,
    detailsFabric: "Silk",
    pricePaise: 125_000,
    typeSlug: "saree",
    typeName: "Saree",
    tags: [],
    collection: null,
    images: [
      {
        sortOrder: 0,
        media: {
          id: "22222222-2222-4222-8222-222222222222",
          url: approvedUrl,
          derivativeDeliveryActive: true,
          derivatives: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              mediaAssetId: "22222222-2222-4222-8222-222222222222",
              role: "pdp",
              status: "ready",
              failureReason: null,
              objectKey: "media/derivatives/v1/asset/pdp.webp",
              sourceHash: "a".repeat(64),
              sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
              generationVersion: 1,
              mimeType: "image/webp",
              byteSize: 400_000,
              width: 1_600,
              height: 2_000,
              url: approvedUrl,
              createdAt: new Date("2026-08-01T00:00:00.000Z"),
              updatedAt: new Date("2026-08-01T00:00:00.000Z"),
            },
          ],
          mimeType: "image/webp",
          filesize: 400_000,
          width: 1_600,
          height: 2_000,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
    ],
    ...overrides,
  }) as ProductWithRelations;

describe("Drape Room product projection", () => {
  beforeEach(() => {
    vi.stubEnv("FTT_MEDIA_DERIVATIVE_DESTINATION_HOST", mediaHost);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("projects only the minimal serialisable saree and current PDP identity", () => {
    const projection = projectDrapeSaree(makeProduct());

    expect(projection).toEqual({
      eligible: true,
      saree: expect.objectContaining({
        productId: "11111111-1111-4111-8111-111111111111",
        productImageId: "22222222-2222-4222-8222-222222222222",
        productSlug: "gold-zari-saree",
        displayImageUrl: approvedUrl,
        stockStatus: "available",
      }),
    });
    if (projection.eligible) {
      expect(projection.saree.productReferenceVersion).toMatch(
        /^gallery-v1:22222222-2222-4222-8222-222222222222:22222222-2222-4222-8222-222222222222:[a-f0-9]{16}$/,
      );
      expect(projection.saree.productReferenceVersion.length).toBeLessThanOrEqual(
        200,
      );
      expect(Object.keys(projection.saree).sort()).toEqual(
        [
          "displayImageUrl",
          "fabric",
          "generationReady",
          "pricePaise",
          "productId",
          "productImageId",
          "productName",
          "productReferenceVersion",
          "productSlug",
          "stockStatus",
        ].sort(),
      );
    }
  });

  it.each([
    [{ status: "draft" }, "draft"],
    [{ typeSlug: "blouse" }, "blouse"],
    [
      {
        stockStatus: "reserved",
        reservedUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
      "unavailable",
    ],
    [{ stockStatus: "sold" }, "unavailable"],
  ] as const)("rejects ineligible product state %#", (overrides, reason) => {
    expect(projectDrapeSaree(makeProduct(overrides))).toEqual({
      eligible: false,
      reason,
    });
  });

  it("treats an expired reservation as effectively available", () => {
    const projection = projectDrapeSaree(
      makeProduct({
        stockStatus: "reserved",
        reservedUntil: new Date("2020-01-01T00:00:00.000Z"),
      }),
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(projection.eligible).toBe(true);
  });

  it("uses an approved original when no current PDP derivative exists", () => {
    const product = makeProduct();
    product.images[0]!.media.derivatives = [];

    expect(projectDrapeRoomEntry(product)).toEqual({
      eligible: true,
      saree: expect.objectContaining({
        displayImageUrl: approvedUrl,
        generationReady: true,
        productId: product.id,
        productReferenceVersion: expect.stringMatching(/^gallery-v1:/),
      }),
    });
    expect(projectDrapeSaree(product).eligible).toBe(true);
  });

  it("selects a full-look image and a complementary detail from the complete gallery", () => {
    const product = makeProduct();
    const base = product.images[0]!;
    const relation = (
      id: string,
      alt: string,
      sortOrder: number,
      width: number,
      height: number,
      hashCharacter: string,
    ): ProductWithRelations["images"][number] => {
      const url = `https://${mediaHost}/media/derivatives/${id}.webp`;
      return {
        sortOrder,
        media: {
          ...base.media,
          id,
          alt,
          filename: `${alt.replaceAll(" ", "-")}.webp`,
          key: `media/${id}.webp`,
          url,
          width,
          height,
          derivatives: [
            {
              ...base.media.derivatives![0]!,
              id: `${id.slice(0, -1)}9`,
              mediaAssetId: id,
              sourceHash: hashCharacter.repeat(64),
              url,
              width,
              height,
            },
          ],
        },
      };
    };
    const cardId = "22222222-2222-4222-8222-222222222222";
    const detailId = "44444444-4444-4444-8444-444444444444";
    const fullLookId = "55555555-5555-4555-8555-555555555555";
    product.images = [
      relation(cardId, "Product card crop", 0, 1_600, 2_000, "a"),
      relation(detailId, "Pallu border motif detail", 1, 1_600, 1_600, "b"),
      relation(fullLookId, "Full length front model look", 2, 1_400, 2_100, "c"),
    ];

    const references = resolveDrapeProductReferences(product);

    expect(references?.primary.mediaId).toBe(fullLookId);
    expect(references?.secondary.mediaId).toBe(detailId);
    expect(references?.version).toMatch(
      new RegExp(`^gallery-v1:${fullLookId}:${detailId}:[a-f0-9]{16}$`),
    );
    expect(projectDrapeSaree(product)).toEqual({
      eligible: true,
      saree: expect.objectContaining({
        displayImageUrl: references?.primary.url,
        productImageId: fullLookId,
        productReferenceVersion: references?.version,
      }),
    });
  });

  it("allows a trusted 8.13 MB original and versions it from server-owned metadata", () => {
    const product = makeProduct();
    const media = product.images[0]!.media;
    media.derivatives = [];
    media.mimeType = "image/jpeg";
    media.filesize = 8_129_628;
    media.width = 3_456;
    media.height = 5_184;
    media.updatedAt = new Date("2026-08-24T09:00:00.000Z");

    const projection = projectDrapeSaree(product);
    expect(projection.eligible).toBe(true);
    if (!projection.eligible) throw new Error("expected eligible original");
    expect(projection.saree.productReferenceVersion).toMatch(/^gallery-v1:/);
  });

  it("does not expose an entry for an unapproved display image", () => {
    const product = makeProduct();
    product.images[0]!.media.derivatives = [];
    product.images[0]!.media.url = "https://example.com/media/saree.webp";

    expect(projectDrapeRoomEntry(product)).toEqual({
      eligible: false,
      reason: "missing_reference",
    });
  });

  it("falls back when a PDP derivative is over budget", () => {
    const product = makeProduct();
    const derivative = product.images[0]!.media.derivatives?.[0];
    if (!derivative) throw new Error("fixture derivative missing");
    derivative.byteSize = 700_001;

    const projection = projectDrapeSaree(product);
    expect(projection.eligible).toBe(true);
    if (!projection.eligible) throw new Error("expected source fallback");
    expect(projection.saree.productReferenceVersion).toMatch(/^gallery-v1:/);
  });

  it("uses the next current bounded derivative before considering an original", () => {
    const product = makeProduct();
    const media = product.images[0]!.media;
    const derivative = media.derivatives?.[0];
    if (!derivative) throw new Error("fixture derivative missing");
    derivative.role = "card";
    derivative.byteSize = 150_000;
    derivative.width = 800;
    derivative.height = 1_000;

    const references = resolveDrapeProductReferences(product);

    expect(references?.primary).toEqual(
      expect.objectContaining({
        kind: "derivative",
        width: 800,
      }),
    );
    expect(references?.primary.version).toContain("derivative:card:");
  });

  it("keeps an oversized legacy original discoverable but not generation-ready", () => {
    const product = makeProduct();
    const media = product.images[0]!.media;
    media.derivatives = [];
    media.mimeType = "image/jpeg";
    media.filesize = 10_560_458;
    media.width = 6_912;
    media.height = 10_368;

    expect(projectDrapeSaree(product)).toEqual({
      eligible: false,
      reason: "missing_reference",
    });
    expect(projectDrapeRoomEntry(product)).toEqual({
      eligible: true,
      saree: expect.objectContaining({
        generationReady: false,
        productId: product.id,
      }),
    });
  });

  it("rejects a product source above the trusted 16 MB ceiling", () => {
    const product = makeProduct();
    product.images[0]!.media.derivatives = [];
    product.images[0]!.media.filesize = 16_000_001;

    expect(projectDrapeSaree(product)).toEqual({
      eligible: false,
      reason: "missing_reference",
    });
  });
});
