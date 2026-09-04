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
        /^gallery-v2:single:22222222-2222-4222-8222-222222222222:[a-f0-9]{16}$/,
      );
      expect(projection.saree.productReferenceVersion.length).toBeLessThanOrEqual(
        200,
      );
      expect(Object.keys(projection.saree).sort()).toEqual(
        [
          "displayImageUrl",
          "fabric",
          "generationReady",
          // Public catalogue listing price — carried so the Drape Room's
          // Add to bag records the same markdown as the PDP.
          "originalPricePaise",
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
        productReferenceVersion: expect.stringMatching(/^gallery-v2:single:/),
      }),
    });
    expect(projectDrapeSaree(product).eligible).toBe(true);
  });

  it("keeps one trusted gallery image in single-reference mode", () => {
    const references = resolveDrapeProductReferences(makeProduct());

    expect(references?.mode).toBe("single");
    expect(references?.references).toHaveLength(1);
  });

  it("uses two safe originals in dual mode without derivatives", () => {
    const product = makeProduct();
    const first = product.images[0]!;
    first.media.derivatives = [];
    first.media.mimeType = "image/jpeg";
    first.media.filesize = 1_200_000;
    first.media.width = 1_200;
    first.media.height = 1_800;
    first.media.alt = "Full length front saree look";
    product.images.push({
      sortOrder: 1,
      media: {
        ...first.media,
        id: "44444444-4444-4444-8444-444444444444",
        url: `https://${mediaHost}/media/pallu-detail.jpg`,
        alt: "Pallu border motif detail",
        width: 1_400,
        height: 1_400,
      },
    });

    const references = resolveDrapeProductReferences(product);

    expect(references?.mode).toBe("dual");
    expect(references?.references).toHaveLength(2);
    expect(
      references?.references.every((reference) => reference.kind === "source"),
    ).toBe(true);
  });

  it("keeps two full-look images single when neither has textile-detail evidence", () => {
    const product = makeProduct();
    const first = product.images[0]!;
    first.media.alt = "Full length front model look";
    first.media.filename = "full-length-front-look.webp";
    first.media.key = "media/full-length-front-look.webp";
    const secondId = "44444444-4444-4444-8444-444444444444";
    const secondUrl = `https://${mediaHost}/media/derivatives/second-look.webp`;
    product.images.push({
      sortOrder: 1,
      media: {
        ...first.media,
        id: secondId,
        alt: "Full body rear model look",
        filename: "full-body-rear-look.webp",
        key: "media/full-body-rear-look.webp",
        url: secondUrl,
        derivatives: [
          {
            ...first.media.derivatives![0]!,
            id: "55555555-5555-4555-8555-555555555555",
            mediaAssetId: secondId,
            sourceHash: "b".repeat(64),
            url: secondUrl,
          },
        ],
      },
    });

    const references = resolveDrapeProductReferences(product);

    expect(references?.mode).toBe("single");
    expect(references?.references).toHaveLength(1);
  });

  /**
   * The reviewed threshold (MIN_COMPLEMENTARY_DETAIL_SCORE) is what stops a
   * merely-different second image from buying a third provider image on every
   * generation. These cases pin it from both sides, and pin the vocabulary that
   * is allowed to qualify an image at all — without them the whole suite still
   * passes with the threshold set to 0.
   */
  describe("complementary detail threshold", () => {
    const secondId = "44444444-4444-4444-8444-444444444444";
    const secondUrl = `https://${mediaHost}/media/derivatives/second.webp`;

    const withSecondImage = (
      alt: string,
      width: number,
      height: number,
      names: { filename?: string; key?: string } = {},
    ) => {
      const product = makeProduct();
      const first = product.images[0]!;
      first.media.alt = "Full length front model look";
      first.media.filename = "full-length-front-look.webp";
      first.media.key = "media/full-length-front-look.webp";
      product.images.push({
        sortOrder: 1,
        media: {
          ...first.media,
          id: secondId,
          alt,
          filename: names.filename ?? `${alt.replaceAll(" ", "-") || "second"}.webp`,
          key: names.key ?? `media/${secondId}.webp`,
          url: secondUrl,
          width,
          height,
          derivatives: [
            {
              ...first.media.derivatives![0]!,
              id: "55555555-5555-4555-8555-555555555555",
              mediaAssetId: secondId,
              sourceHash: "b".repeat(64),
              url: secondUrl,
              width,
              height,
            },
          ],
        },
      });
      return product;
    };

    it("stays single for a detail keyword that scores below the threshold", () => {
      // One strong term, portrait framing (ratio 1.6 falls outside the detail
      // band), sortOrder 1 -> 35 + 0 + 3 - 1 = 37, under 45.
      const references = resolveDrapeProductReferences(
        withSecondImage("Border", 1_000, 1_600),
      );

      expect(references?.mode).toBe("single");
      expect(references?.references).toHaveLength(1);
    });

    it("goes dual once the same evidence clears the threshold", () => {
      // Same single strong term, but square detail framing and higher
      // resolution -> 35 + 10 + 3 - 1 = 47, at or above 45.
      const references = resolveDrapeProductReferences(
        withSecondImage("Border", 1_600, 1_600),
      );

      expect(references?.mode).toBe("dual");
      expect(references?.references).toHaveLength(2);
      expect(references?.mode === "dual" && references.detail.mediaId).toBe(
        secondId,
      );
    });

    it("does not treat a generic filename or storage key as textile-detail evidence", () => {
      // "design" / "pattern" appear constantly in exported filenames and object
      // keys with no textile meaning. Alone they must not buy IMAGE 3.
      const references = resolveDrapeProductReferences(
        withSecondImage("", 1_600, 1_600, {
          filename: "saree-design-2.webp",
          key: "media/pattern/saree-design-2.webp",
        }),
      );

      expect(references?.mode).toBe("single");
      expect(references?.references).toHaveLength(1);
    });

    it("does not treat an incidental 'designer' substring as detail evidence", () => {
      const references = resolveDrapeProductReferences(
        withSecondImage("Designer patterned studio shot", 1_600, 1_600),
      );

      expect(references?.mode).toBe("single");
    });

    it("still goes dual for curated close-up language", () => {
      const references = resolveDrapeProductReferences(
        withSecondImage("Pallu zari weave close-up", 1_600, 1_600),
      );

      expect(references?.mode).toBe("dual");
    });
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

    expect(references?.mode).toBe("dual");
    expect(references?.primary.mediaId).toBe(fullLookId);
    expect(references?.references[1]?.mediaId).toBe(detailId);
    expect(references?.version).toMatch(
      new RegExp(`^gallery-v2:dual:${fullLookId}:${detailId}:[a-f0-9]{16}$`),
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

  it("collapses duplicate media asset IDs to one garment reference", () => {
    const product = makeProduct();
    const original = product.images[0]!;
    const derivative = original.media.derivatives![0]!;
    const duplicateUrl = `https://${mediaHost}/media/derivatives/duplicate.webp`;
    product.images = [
      original,
      {
        sortOrder: 1,
        media: {
          ...original.media,
          alt: "Pallu border detail",
          url: duplicateUrl,
          derivatives: [
            {
              ...derivative,
              id: "66666666-6666-4666-8666-666666666666",
              sourceHash: "b".repeat(64),
              url: duplicateUrl,
            },
          ],
        },
      },
    ];

    const references = resolveDrapeProductReferences(product);

    expect(references?.mode).toBe("single");
    expect(references?.references).toHaveLength(1);
  });

  it("collapses distinct media rows with the same authoritative source hash", () => {
    const product = makeProduct();
    const original = product.images[0]!;
    const derivative = original.media.derivatives![0]!;
    const duplicateMediaId = "77777777-7777-4777-8777-777777777777";
    const duplicateUrl = `https://${mediaHost}/media/derivatives/source-copy.webp`;
    product.images = [
      original,
      {
        sortOrder: 1,
        media: {
          ...original.media,
          id: duplicateMediaId,
          alt: "Pallu border detail",
          url: duplicateUrl,
          derivatives: [
            {
              ...derivative,
              id: "88888888-8888-4888-8888-888888888888",
              mediaAssetId: duplicateMediaId,
              url: duplicateUrl,
            },
          ],
        },
      },
    ];

    const references = resolveDrapeProductReferences(product);

    expect(references?.mode).toBe("single");
    expect(references?.references).toHaveLength(1);
  });

  it("defensively collapses legacy source rows with the same canonical URL and no hash", () => {
    const product = makeProduct();
    const original = product.images[0]!;
    original.media.derivatives = [];
    original.media.metadata = null;
    product.images = [
      original,
      {
        sortOrder: 1,
        media: {
          ...original.media,
          id: "99999999-9999-4999-8999-999999999999",
          alt: "Legacy pallu detail",
          metadata: null,
        },
      },
    ];

    const references = resolveDrapeProductReferences(product);

    expect(references?.mode).toBe("single");
    expect(references?.references).toHaveLength(1);
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
    expect(projection.saree.productReferenceVersion).toMatch(
      /^gallery-v2:single:/,
    );
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
    expect(projection.saree.productReferenceVersion).toMatch(
      /^gallery-v2:single:/,
    );
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

  it("keeps the trigger visible when a later gallery image is displayable", () => {
    const product = makeProduct();
    const leading = product.images[0]!;
    leading.media.derivatives = [];
    leading.media.mimeType = "image/jpeg";
    leading.media.filesize = 16_549_365;
    leading.media.width = 6_912;
    leading.media.height = 10_368;
    leading.media.url = `https://${mediaHost}/media/legacy-leading.jpg`;

    const laterMediaId = "44444444-4444-4444-8444-444444444444";
    const laterUrl = `https://${mediaHost}/media/legacy-visible.jpg`;
    product.images.push({
      sortOrder: 1,
      media: {
        ...leading.media,
        id: laterMediaId,
        url: laterUrl,
        filename: "legacy-visible.jpg",
        key: "media/legacy-visible.jpg",
        filesize: 11_970_235,
        width: 5_884,
        height: 8_237,
      },
    });

    expect(resolveDrapeProductReferences(product)).toBeNull();
    expect(projectDrapeSaree(product)).toEqual({
      eligible: false,
      reason: "missing_reference",
    });
    expect(projectDrapeRoomEntry(product)).toEqual({
      eligible: true,
      saree: expect.objectContaining({
        displayImageUrl: laterUrl,
        generationReady: false,
        productId: product.id,
        productImageId: laterMediaId,
        productReferenceVersion: `display-only:${laterMediaId}`,
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
