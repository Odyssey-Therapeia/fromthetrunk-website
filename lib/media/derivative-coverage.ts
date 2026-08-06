import type { ProductWithRelations } from "@/db/queries/products";
import type { MediaDerivativeRecord } from "@/db/queries/media-derivatives";
import {
  APPROVED_SOURCE_MIME_TYPES,
  isApprovedMediaUrl,
  MEDIA_DERIVATIVE_ROLES,
  type MediaDerivativeRole,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";
import {
  isSeoEligibleProduct,
  shouldIncludeProductInSeo,
} from "@/lib/seo/product-indexing";

const isFeedBusinessEligible = (product: ProductWithRelations): boolean =>
  product.status === "published" &&
  !product.name.toLowerCase().startsWith("test chiffon") &&
  product.images.length > 0;

const sortedImages = (product: ProductWithRelations) =>
  [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);

const validDerivativeFor = (
  derivatives: MediaDerivativeRecord[],
  mediaAssetId: string,
  role: MediaDerivativeRole,
  sourceUpdatedAt?: Date,
): MediaDerivativeRecord | null =>
  derivatives.find(
    (row) =>
      row.mediaAssetId === mediaAssetId &&
      row.role === role &&
      (!sourceUpdatedAt ||
        new Date(row.sourceUpdatedAt).getTime() === sourceUpdatedAt.getTime()) &&
      validateReadyMediaDerivative(row).valid,
  ) ?? null;

export type MediaDerivativeCoverageReport = {
  activeProductImages: number;
  derivativeRows: number;
  feedEligibleProducts: number;
  googleFeedCount: number;
  historicalBlobHosts: Record<string, number>;
  invalidDerivativeReasons: Record<string, number>;
  invalidSourceUrls: Array<{ mediaAssetId: string; productSlug: string }>;
  jsonLdImageCount: number;
  metaFeedCount: number;
  missingByRole: Record<MediaDerivativeRole, string[]>;
  originalLeakage: string[];
  productOgImageCount: number;
  productsBlocked: Array<{
    mediaAssetId: string;
    productSlug: string;
    roles: MediaDerivativeRole[];
  }>;
  productsReadyByRole: Record<MediaDerivativeRole, number>;
  publishedProducts: number;
  releaseAllowed: boolean;
  sitemapImageEntries: number;
  sitemapProductUrls: number;
  sourceAssetsWithUnknownMetadata: number;
  sourceAssetsWithUnsupportedMime: number;
  totalMediaAssets: number;
  totalSourceBytesKnown: number;
};

export const buildMediaDerivativeCoverageReport = ({
  derivatives,
  products,
  totalMediaAssets,
}: {
  derivatives: MediaDerivativeRecord[];
  products: ProductWithRelations[];
  totalMediaAssets: number;
}): MediaDerivativeCoverageReport => {
  const published = products.filter((product) => product.status === "published");
  const imageRows = published.flatMap((product) =>
    sortedImages(product).map((image) => ({ image, product })),
  );
  const uniqueMedia = new Map(
    imageRows.map(({ image }) => [image.media.id, image.media]),
  );
  const originalUrls = new Set(
    Array.from(uniqueMedia.values()).map((media) => media.url),
  );

  const missingByRole = Object.fromEntries(
    MEDIA_DERIVATIVE_ROLES.map((role) => [role, [] as string[]]),
  ) as Record<MediaDerivativeRole, string[]>;
  const productsReadyByRole = Object.fromEntries(
    MEDIA_DERIVATIVE_ROLES.map((role) => [role, 0]),
  ) as Record<MediaDerivativeRole, number>;

  for (const product of published) {
    const images = sortedImages(product);
    for (const role of MEDIA_DERIVATIVE_ROLES) {
      const ready =
        images.length > 0 &&
        images.every((image) =>
          Boolean(
            validDerivativeFor(
              derivatives,
              image.media.id,
              role,
              image.media.updatedAt,
            ),
          ),
        );
      if (ready) productsReadyByRole[role] += 1;
      else missingByRole[role].push(product.slug);
    }
  }

  const productsBlocked = imageRows.flatMap(({ image, product }) => {
    const roles = MEDIA_DERIVATIVE_ROLES.filter(
      (role) =>
        !validDerivativeFor(
          derivatives,
          image.media.id,
          role,
          image.media.updatedAt,
        ),
    );
    return roles.length > 0
      ? [{ mediaAssetId: image.media.id, productSlug: product.slug, roles }]
      : [];
  });

  const invalidDerivativeReasons: Record<string, number> = {};
  for (const derivative of derivatives) {
    const validation = validateReadyMediaDerivative(derivative);
    if (validation.valid) continue;
    const reason = validation.reason ?? "unknown";
    invalidDerivativeReasons[reason] =
      (invalidDerivativeReasons[reason] ?? 0) + 1;
  }

  const invalidSourceUrls = imageRows.flatMap(({ image, product }) =>
    isApprovedMediaUrl(image.media.url)
      ? []
      : [{ mediaAssetId: image.media.id, productSlug: product.slug }],
  );
  const historicalBlobHosts: Record<string, number> = {};
  for (const media of uniqueMedia.values()) {
    try {
      const host = new URL(media.url).hostname;
      historicalBlobHosts[host] = (historicalBlobHosts[host] ?? 0) + 1;
    } catch {
      historicalBlobHosts.invalid = (historicalBlobHosts.invalid ?? 0) + 1;
    }
  }

  const sitemapProducts = published.filter(shouldIncludeProductInSeo);
  const seoEligible = published.filter(isSeoEligibleProduct);
  const feedEligible = published.filter(isFeedBusinessEligible);
  const hasPrimary = (product: ProductWithRelations, role: MediaDerivativeRole) => {
    const primary = sortedImages(product)[0];
    return Boolean(
      primary &&
        validDerivativeFor(
          derivatives,
          primary.media.id,
          role,
          primary.media.updatedAt,
        ),
    );
  };
  const derivativeUrls = derivatives
    .filter((row) => validateReadyMediaDerivative(row).valid)
    .map((row) => row.url)
    .filter((url): url is string => Boolean(url));
  const originalLeakage = derivativeUrls.filter((url) => originalUrls.has(url));

  const releaseAllowed =
    productsBlocked.length === 0 &&
    invalidSourceUrls.length === 0 &&
    Object.keys(invalidDerivativeReasons).length === 0 &&
    originalLeakage.length === 0 &&
    sitemapProducts.every((product) => hasPrimary(product, "seo_master")) &&
    feedEligible.every((product) => hasPrimary(product, "feed")) &&
    seoEligible.every((product) => hasPrimary(product, "social_og"));

  return {
    activeProductImages: imageRows.length,
    derivativeRows: derivatives.length,
    feedEligibleProducts: feedEligible.length,
    googleFeedCount: feedEligible.filter((product) => hasPrimary(product, "feed")).length,
    historicalBlobHosts,
    invalidDerivativeReasons,
    invalidSourceUrls,
    jsonLdImageCount: seoEligible.filter((product) => hasPrimary(product, "seo_master")).length,
    metaFeedCount: feedEligible.filter((product) => hasPrimary(product, "feed")).length,
    missingByRole,
    originalLeakage,
    productOgImageCount: seoEligible.filter((product) => hasPrimary(product, "social_og")).length,
    productsBlocked,
    productsReadyByRole,
    publishedProducts: published.length,
    releaseAllowed,
    sitemapImageEntries: sitemapProducts.filter((product) => hasPrimary(product, "seo_master")).length,
    sitemapProductUrls: sitemapProducts.length,
    sourceAssetsWithUnknownMetadata: Array.from(uniqueMedia.values()).filter(
      (media) => !media.filesize || !media.width || !media.height,
    ).length,
    sourceAssetsWithUnsupportedMime: Array.from(uniqueMedia.values()).filter(
      (media) =>
        !media.mimeType ||
        !APPROVED_SOURCE_MIME_TYPES.has(media.mimeType.toLowerCase()),
    ).length,
    totalMediaAssets,
    totalSourceBytesKnown: Array.from(uniqueMedia.values()).reduce(
      (total, media) => total + (media.filesize ?? 0),
      0,
    ),
  };
};
