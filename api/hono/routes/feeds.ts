/**
 * P5-01: Product feed routes.
 *
 * GET /api/v2/feeds/google-merchant.xml
 *   — Google Merchant Center RSS 2.0 product feed.
 *   — Uses the exact same listProducts query as the sitemap so the feed and
 *     sitemap cannot disagree.
 *   — Shared mapping via lib/channels/feed-mapping.ts so the Meta feed (P5-02)
 *     reuses the same logic and the two feeds cannot drift.
 *
 * Security: feeds are PUBLIC by design (Google/Meta fetch unauthenticated).
 *   Optional static deterrent token: if FEEDS_PUBLIC_TOKEN is set, the request
 *   must carry ?token=<value> or the response is 403.
 */

import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { listProducts } from "@/db/queries/products";
import type { ProductWithRelations } from "@/db/queries/products";
import { resolveProductRowStockStatus } from "@/db/inventory";
import { mapProductToFeedItem } from "@/lib/channels/feed-mapping";

// ---------------------------------------------------------------------------
// Test-product exclusion identifier (P1-15)
// The live "test chiffon do not buy if not authorized" product must never
// appear in the feed. We match on the lower-cased name prefix.
// ---------------------------------------------------------------------------
const TEST_PRODUCT_NAME_PREFIX = "test chiffon";

/**
 * Returns true if a product should be excluded from the feed.
 *
 * Exclusion rules (feed-level, documented in docs/spikes/channel-audit.md):
 *  1. Drafts  — already filtered by listProducts({ includeDrafts: false }),
 *               but we guard here too in case the products array is injected
 *               directly (e.g. in tests).
 *  2. Test product — name starts with "test chiffon" (case-insensitive).
 *  3. Zero-image items — g:image_link is required by Google Merchant Center.
 */
export function shouldExcludeFromFeed(product: ProductWithRelations): boolean {
  if (product.status !== "published") return true;
  if (product.name.toLowerCase().startsWith(TEST_PRODUCT_NAME_PREFIX)) return true;
  if (product.images.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// XML serialisation helpers
// ---------------------------------------------------------------------------

/** Escape special XML characters in text content. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap content in an XML element. Skips if value is null/undefined. */
function el(tag: string, value: string | null | undefined): string {
  if (value == null) return "";
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

/**
 * Serialise eligible products to a Google Merchant Center RSS 2.0 feed string.
 *
 * This function is exported so tests can call it directly with injected product
 * arrays (mock @/db, run listProducts for real, then call this serialiser).
 *
 * Stock status is resolved from the canonical product row so the feed, PDP, and
 * lightweight stock API cannot disagree during the inventory-v2 transition.
 */
export function buildGoogleMerchantFeedXml(products: ProductWithRelations[]): string {
  const eligible = products.filter((p) => !shouldExcludeFromFeed(p));

  const items = eligible
    .map((product) => {
      const effectiveStockStatus = resolveProductRowStockStatus({
        reservedUntil: product.reservedUntil,
        stockStatus: product.stockStatus,
      });
      const effectiveProduct =
        effectiveStockStatus === product.stockStatus
          ? product
          : { ...product, stockStatus: effectiveStockStatus };
      const item = mapProductToFeedItem(effectiveProduct);

      const additionalImages = item.additionalImageUrls
        .map((url) => el("g:additional_image_link", url))
        .join("\n      ");

      return `  <item>
    ${el("g:id", item.id)}
    ${el("title", item.title)}
    ${el("g:description", item.description)}
    ${el("link", item.link)}
    ${el("g:price", `${item.price.toFixed(2)} ${item.currency}`)}
    ${el("g:availability", item.availability)}
    ${el("g:condition", item.condition)}
    ${el("g:identifier_exists", "no")}
    ${el("g:brand", item.brand)}
    ${el("g:image_link", item.imageUrl)}
    ${additionalImages}
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>From the Trunk — Product Feed</title>
    <link>https://www.fromthetrunk.shop</link>
    <description>Curated pre-loved luxury sarees with provenance.</description>
${items}
  </channel>
</rss>`;
}

// ---------------------------------------------------------------------------
// CSV serialisation helpers (Meta catalog feed — P5-02)
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV cell per RFC 4180.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Embedded double-quotes are doubled.
 */
function escapeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Meta catalog CSV column headers.
 * Required by Meta: id, title, description, availability, condition, price,
 * link, image_link, brand. Optional but recommended: additional_image_link.
 */
const META_CSV_HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
  "additional_image_link",
] as const;

/**
 * Serialise eligible products to a Meta catalog CSV string.
 *
 * Exported so tests can call it directly with injected product arrays
 * (mock @/db, run listProducts for real, then call this serialiser).
 *
 * The ONLY Meta-specific code here is the column mapping (FeedItemData field
 * names → Meta CSV column names + value formats). All price, availability,
 * description, exclusion, and image logic lives in lib/channels/feed-mapping.ts
 * and feeds.ts:shouldExcludeFromFeed — this function does not duplicate any of it.
 *
 * Stock status is resolved from the canonical product row. The v2 reservation
 * table is not allowed to override public feed availability until it becomes
 * the canonical checkout source.
 */
export function buildMetaCatalogCsv(products: ProductWithRelations[]): string {
  const eligible = products.filter((p) => !shouldExcludeFromFeed(p));

  const headerRow = META_CSV_HEADERS.map(escapeCsvCell).join(",");

  const dataRows = eligible.map((product) => {
    const effectiveStockStatus = resolveProductRowStockStatus({
      reservedUntil: product.reservedUntil,
      stockStatus: product.stockStatus,
    });
    const effectiveProduct =
      effectiveStockStatus === product.stockStatus
        ? product
        : { ...product, stockStatus: effectiveStockStatus };

    // THE LOAD-BEARING CALL: reuse the shared mapping — no reimplementation.
    const item = mapProductToFeedItem(effectiveProduct);

    // Meta vocabulary:
    // - availability: "in_stock" / "out_of_stock" (same as FeedAvailability)
    // - price: "1234.00 INR"
    // - additional_image_link: first additional image (Meta accepts one per column;
    //   for multiple extras, rows can repeat or a comma-separated list is used —
    //   we emit the first additional image URL in the column, which is the common
    //   single-column approach for Meta catalog CSVs).
    const cells: string[] = [
      escapeCsvCell(item.id),
      escapeCsvCell(item.title),
      escapeCsvCell(item.description),
      escapeCsvCell(item.availability),
      escapeCsvCell(item.condition),
      escapeCsvCell(`${item.price.toFixed(2)} ${item.currency}`),
      escapeCsvCell(item.link),
      escapeCsvCell(item.imageUrl ?? ""),
      escapeCsvCell(item.brand),
      escapeCsvCell(item.additionalImageUrls[0] ?? ""),
    ];

    return cells.join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerFeedsRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/google-merchant.xml", async (c) => {
    // Optional deterrent token gate
    const configuredToken = process.env.FEEDS_PUBLIC_TOKEN;
    if (configuredToken) {
      const provided = c.req.query("token");
      if (provided !== configuredToken) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Fetch ALL published products using the same query as the sitemap
    const { rows: products } = await listProducts({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });

    const xml = buildGoogleMerchantFeedXml(products);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Instruct intermediate caches to hold the feed for 1 hour
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  // -------------------------------------------------------------------------
  // P5-02: Meta catalog feed
  // GET /api/v2/feeds/meta-catalog.csv
  // Reuses the SAME shared mapping (mapProductToFeedItem), SAME exclusion
  // function (shouldExcludeFromFeed), and SAME listProducts query as the
  // Google feed — only the serialiser differs (CSV instead of RSS XML).
  // -------------------------------------------------------------------------
  app.get("/meta-catalog.csv", async (c) => {
    // Optional deterrent token gate — identical to Google feed gate
    const configuredToken = process.env.FEEDS_PUBLIC_TOKEN;
    if (configuredToken) {
      const provided = c.req.query("token");
      if (provided !== configuredToken) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Fetch ALL published products — SAME query as the Google feed and sitemap
    const { rows: products } = await listProducts({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });

    const csv = buildMetaCatalogCsv(products);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // Instruct intermediate caches to hold the feed for 1 hour
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
};
