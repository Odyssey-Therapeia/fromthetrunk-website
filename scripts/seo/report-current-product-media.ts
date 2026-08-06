/**
 * Read-only current-data product media inventory.
 *
 * This intentionally reads only products, product_images, and media_assets. It
 * never requires the optional media_derivatives table and performs no writes.
 */
import { rawSql } from "@/db";
import {
  resolveCurrentMediaImage,
  resolvePrimaryCurrentProductImage,
  type CurrentMediaLike,
} from "@/lib/media/product-image-resolver";
import { getCurrentProductMediaMeasurement } from "@/lib/media/current-product-media-measurements.generated";

type Row = {
  alt: string | null;
  filesize: number | null;
  height: number | null;
  media_id: string;
  metadata: Record<string, unknown> | null;
  mime_type: string | null;
  product_id: string;
  product_slug: string;
  sort_order: number;
  url: string;
  width: number | null;
};

async function main() {
const rows = (await rawSql`
  select
    ma.alt,
    ma.filesize,
    ma.height,
    ma.id::text as media_id,
    ma.metadata,
    ma.mime_type,
    p.id::text as product_id,
    p.slug as product_slug,
    pi.sort_order,
    ma.url,
    ma.width
  from products p
  join product_images pi on pi.product_id = p.id
  join media_assets ma on ma.id = pi.media_id
  where p.status = 'published'
  order by p.slug, pi.sort_order, ma.id
`) as Row[];

const uniqueMedia = new Map<string, Row>();
const productIds = new Map<string, string>();
const productRows = new Map<string, Row[]>();
for (const row of rows) {
  uniqueMedia.set(row.media_id, row);
  productIds.set(row.product_id, row.product_slug);
  const current = productRows.get(row.product_id) ?? [];
  current.push(row);
  productRows.set(row.product_id, current);
}

const toMedia = (row: Row): CurrentMediaLike => ({
  alt: row.alt,
  filesize: row.filesize,
  height: row.height,
  id: row.media_id,
  metadata: row.metadata,
  mimeType: row.mime_type,
  url: row.url,
  width: row.width,
});

const productsMatching = (predicate: (row: Row) => boolean) =>
  Array.from(
    new Set(rows.filter(predicate).map((row) => row.product_slug)),
  ).sort();

const toProduct = (group: Row[]) => ({
  images: group.map((row) => ({ media: toMedia(row), sortOrder: row.sort_order })),
});

const selectedByRole = Object.fromEntries(
  (["card", "thumbnail", "seo", "social", "feed"] as const).map((role) => [
    role,
    [...productRows.values()].map((group) => ({
      productSlug: group[0]!.product_slug,
      ...resolvePrimaryCurrentProductImage(toProduct(group), role),
    })),
  ]),
);

const hostCounts = new Map<string, { mediaAssets: Set<string>; products: Set<string> }>();
for (const row of uniqueMedia.values()) {
  let host = "invalid-or-local";
  try {
    host = new URL(row.url).hostname.toLowerCase();
  } catch {
    // The report labels, rather than repairs, invalid/local media data.
  }
  const current = hostCounts.get(host) ?? {
    mediaAssets: new Set<string>(),
    products: new Set<string>(),
  };
  current.mediaAssets.add(row.media_id);
  for (const related of rows.filter((candidate) => candidate.media_id === row.media_id)) {
    current.products.add(related.product_slug);
  }
  hostCounts.set(host, current);
}

const safeByRole = Object.fromEntries(
  (["seo", "social", "feed"] as const).map((role) => [
    role,
    {
      mediaAssets: Array.from(uniqueMedia.values()).filter(
        (row) => resolveCurrentMediaImage(toMedia(row), role).image,
      ).length,
      products: productsMatching(
        (row) => Boolean(resolveCurrentMediaImage(toMedia(row), role).image),
      ).length,
      omittedReasons: Array.from(uniqueMedia.values()).reduce<Record<string, number>>(
        (summary, row) => {
          const result = resolveCurrentMediaImage(toMedia(row), role);
          if (!result.reason) return summary;
          summary[result.reason] = (summary[result.reason] ?? 0) + 1;
          return summary;
        },
        {},
      ),
    },
  ]),
);

const variantEntries = (metadata: Record<string, unknown> | null) => {
  if (!metadata) return [];
  const containers = [metadata.sizes, metadata.variants].filter(
    (value): value is Record<string, unknown> =>
      Boolean(value && typeof value === "object"),
  );
  return containers.flatMap((container) => Object.entries(container));
};

const hasVariant = (row: Row, names: string[]) =>
  variantEntries(row.metadata).some(
    ([name, value]) =>
      names.includes(name) &&
      Boolean(
        typeof value === "string" ||
          (value && typeof value === "object" && "url" in value),
      ),
  );

const cardVariantProducts = productsMatching((row) => {
  const image = resolveCurrentMediaImage(toMedia(row), "card").image;
  return Boolean(image && !image.fallbackToOriginal);
});
const thumbnailVariantProducts = productsMatching((row) => {
  const image = resolveCurrentMediaImage(toMedia(row), "thumbnail").image;
  return Boolean(image && !image.fallbackToOriginal);
});
const originalOnlyProducts = productsMatching((row) => {
  const card = resolveCurrentMediaImage(toMedia(row), "card").image;
  const thumbnail = resolveCurrentMediaImage(toMedia(row), "thumbnail").image;
  const pdp = resolveCurrentMediaImage(toMedia(row), "pdp").image;
  return Boolean(
    card?.fallbackToOriginal &&
      thumbnail?.fallbackToOriginal &&
      pdp?.fallbackToOriginal,
  );
});

const report = {
  generatedAt: new Date().toISOString(),
  readOnlyTables: ["products", "product_images", "media_assets"],
  totals: {
    publishedProducts: productIds.size,
    activeProductImageRelationships: rows.length,
    uniqueMediaAssets: uniqueMedia.size,
  },
  exactSourceHosts: Object.fromEntries(
    [...hostCounts.entries()]
      .sort((a, b) => b[1].mediaAssets.size - a[1].mediaAssets.size)
      .map(([host, counts]) => [
        host,
        { mediaAssets: counts.mediaAssets.size, products: counts.products.size },
      ]),
  ),
  coverage: {
    productsWithCardOrWebReadyVariant: cardVariantProducts.length,
    productsWithThumbnailVariant: thumbnailVariantProducts.length,
    productsWithOnlyMainOriginal: originalOnlyProducts.length,
    temporaryStorefrontOriginalFallbackProducts: productsMatching((row) =>
      Boolean(resolveCurrentMediaImage(toMedia(row), "card").image?.fallbackToOriginal),
    ).length,
    productsMissingDimensions: productsMatching(
      (row) => !row.width || !row.height,
    ).length,
    productsMissingByteSize: productsMatching((row) => !row.filesize).length,
    productsWithUnsupportedMime: productsMatching(
      (row) =>
        !row.mime_type ||
        !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(
          row.mime_type.toLowerCase(),
        ),
    ).length,
    productsWithOnlyOneLargeImage: [...productRows.values()].filter(
      (group) => group.length === 1 && (group[0]?.filesize ?? 0) > 2_000_000,
    ).length,
    productsWithExistingCardField: productsMatching((row) =>
      hasVariant(row, ["card", "web", "webReady", "web_ready", "medium", "compressed"]),
    ).length,
    productsWithExistingThumbnailField: productsMatching((row) =>
      hasVariant(row, ["thumbnail", "thumb"]),
    ).length,
    productsMissingDatabaseDimensions: productsMatching(
      (row) => !row.width || !row.height,
    ).length,
    productsMissingMeasuredDimensions: productsMatching((row) => {
      const measured = getCurrentProductMediaMeasurement(row.url);
      return !measured?.width || !measured.height;
    }).length,
    activeUrlsWithQueryParameters: uniqueMedia.size
      ? [...uniqueMedia.values()].filter((row) => {
          try {
            return Boolean(new URL(row.url).search);
          } catch {
            return false;
          }
        }).length
      : 0,
  },
  safeDirectCoverage: safeByRole,
  products: {
    cardOrWebReadyVariant: cardVariantProducts,
    thumbnailVariant: thumbnailVariantProducts,
    originalOnly: originalOnlyProducts,
  },
  selectedProductCoverage: Object.fromEntries(
    Object.entries(selectedByRole).map(([role, selections]) => [
      role,
      {
        selected: selections.filter((entry) => entry.image).length,
        omitted: selections.filter((entry) => !entry.image).length,
        sources: selections.reduce<Record<string, number>>((summary, entry) => {
          const source = entry.image?.source ?? entry.reason ?? "unknown";
          summary[source] = (summary[source] ?? 0) + 1;
          return summary;
        }, {}),
        byteRange: {
          min: Math.min(
            ...selections.flatMap((entry) =>
              entry.image?.filesize ? [entry.image.filesize] : [],
            ),
          ),
          max: Math.max(
            ...selections.flatMap((entry) =>
              entry.image?.filesize ? [entry.image.filesize] : [],
            ),
          ),
        },
        omittedProducts: selections
          .filter((entry) => !entry.image)
          .map((entry) => ({ productSlug: entry.productSlug, reason: entry.reason })),
      },
    ]),
  ),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main();
