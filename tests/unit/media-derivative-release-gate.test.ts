import { describe, expect, it } from "vitest";

import {
  assertPublicationDerivativeRows,
  MediaDerivativePublicationError,
} from "@/lib/media/publication-policy";
import type { MediaDerivativeRecord } from "@/db/queries/media-derivatives";
import type { ProductWithRelations } from "@/db/queries/products";
import { buildMediaDerivativeCoverageReport } from "@/lib/media/derivative-coverage";
import {
  MEDIA_DERIVATIVE_BUDGETS,
  MEDIA_DERIVATIVE_GENERATION_VERSION,
  MEDIA_DERIVATIVE_ROLES,
  type MediaDerivativeRole,
} from "@/lib/media/derivative-policy";
import {
  resolveProductImageForRole,
  serializePublicProductImages,
} from "@/lib/media/media-derivatives";
import { productSeoImageUrls } from "@/lib/seo/image-urls";
import { extractPdpOgData } from "@/lib/seo/og-data";
import {
  assertActiveFeedDerivativeCoverage,
  FeedDerivativeCoverageError,
  mapProductToFeedItem,
} from "@/lib/channels/feed-mapping";

const HOST = "njufw8f4mlcjsl7g.public.blob.vercel-storage.com";
process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST = HOST;
const MEDIA_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-08-04T00:00:00.000Z");
const ORIGINAL_URL = `https://${HOST}/media/original-upload.png`;

const derivative = (role: MediaDerivativeRole): MediaDerivativeRecord => {
  const budget = MEDIA_DERIVATIVE_BUDGETS[role];
  return {
    byteSize: Math.min(budget.targetBytes, budget.hardMaxBytes),
    createdAt: NOW,
    failureReason: null,
    generationVersion: MEDIA_DERIVATIVE_GENERATION_VERSION,
    height: role === "social_og" ? 630 : 2_000,
    id: `${role}-id`,
    mediaAssetId: MEDIA_ID,
    mimeType: budget.mimeType,
    objectKey: `media/derivatives/v1/${MEDIA_ID}/hash/${role}.${budget.format === "jpeg" ? "jpg" : "webp"}`,
    role,
    sourceHash: "a".repeat(64),
    sourceUpdatedAt: NOW,
    status: "ready",
    updatedAt: NOW,
    url: `https://${HOST}/media/derivatives/v1/${MEDIA_ID}/hash/${role}.${budget.format === "jpeg" ? "jpg" : "webp"}`,
    width: budget.targetWidth,
  };
};

const derivatives = MEDIA_DERIVATIVE_ROLES.map(derivative);
const product = {
  id: "product-id",
  name: "Heritage Silk Saree",
  slug: "heritage-silk-saree",
  status: "published",
  stockStatus: "available",
  pricePaise: 500_000,
  originalPricePaise: null,
  featured: false,
  storyTitle: "Heritage Silk",
  storyNarrative: "A documented pre-loved silk saree.",
  storyProvenance: null,
  storyEra: null,
  detailsFabric: "Silk",
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: "Excellent",
  detailsDesigner: null,
  typeId: null,
  attributes: {},
  collectionId: null,
  artisanId: null,
  quantityAvailable: 1,
  reservedUntil: null,
  soldAt: null,
  metadata: null,
  createdAt: NOW,
  updatedAt: NOW,
  collection: null,
  images: [
    {
      media: {
        id: MEDIA_ID,
        key: "",
        url: ORIGINAL_URL,
        filename: "product.png",
        alt: "Heritage silk saree",
        mimeType: null,
        filesize: null,
        width: null,
        height: null,
        blurDataUrl: null,
        metadata: { source: "media-derivative" },
        createdAt: NOW,
        updatedAt: NOW,
        derivativeDeliveryActive: true,
        derivatives,
      },
      sortOrder: 0,
    },
  ],
  tags: [],
  typeName: null,
  typeSlug: null,
} as unknown as ProductWithRelations;

describe("media derivative release safety", () => {
  it("fails closed without role coverage and blocks publication", () => {
    const activeMissing = {
      ...product.images[0],
      media: {
        ...product.images[0].media,
        derivatives: [],
        url: ORIGINAL_URL,
      },
    };
    expect(resolveProductImageForRole(activeMissing, "card")).toEqual({
      image: null,
      reason: "missing_derivative",
    });
    expect(() => assertPublicationDerivativeRows([MEDIA_ID], [])).toThrow(
      MediaDerivativePublicationError,
    );
    expect(() =>
      assertActiveFeedDerivativeCoverage([
        { ...product, images: [activeMissing] },
      ]),
    ).toThrow(FeedDerivativeCoverageError);
  });

  it("passes complete coverage and keeps originals out of every consumer", () => {
    expect(() =>
      assertPublicationDerivativeRows([MEDIA_ID], derivatives),
    ).not.toThrow();
    const report = buildMediaDerivativeCoverageReport({
      derivatives,
      products: [product],
      totalMediaAssets: 1,
    });
    expect(report.releaseAllowed).toBe(true);
    expect(report.sitemapImageEntries).toBe(1);
    expect(report.googleFeedCount).toBe(1);
    expect(report.metaFeedCount).toBe(1);
    expect(report.jsonLdImageCount).toBe(1);
    expect(report.productOgImageCount).toBe(1);

    const outputs = JSON.stringify({
      api: serializePublicProductImages(product),
      feed: mapProductToFeedItem(product),
      og: extractPdpOgData(product),
      sitemap: productSeoImageUrls(product),
    });
    expect(outputs).not.toContain(ORIGINAL_URL);
    expect(productSeoImageUrls(product)).toHaveLength(1);
  });
});
