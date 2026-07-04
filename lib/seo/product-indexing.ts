type SeoMetadata = Record<string, unknown>;

type SeoProductLike = {
  metadata?: null | SeoMetadata;
  name?: null | string;
  pricePaise?: null | number;
  slug?: null | string;
  status?: null | string;
  stockStatus?: null | string;
  storyNarrative?: null | string;
  storyTitle?: null | string;
  tags?: Array<{ name?: null | string; slug?: null | string }>;
  typeSlug?: null | string;
};

const TEST_PRICE_THRESHOLD_PAISE = 100;

const PLACEHOLDER_TEXT_PATTERNS = [
  /\buntitled product\b/i,
  /\btest\b/i,
  /\btest sari\b/i,
  /\btest saree\b/i,
  /\btesting\b/i,
  /\bdummy\b/i,
  /\bplaceholder\b/i,
  /\blorem\b/i,
];

const QA_METADATA_KEYS = new Set([
  "excludefromseo",
  "isqa",
  "istest",
  "qa",
  "seoexclude",
  "test",
]);

function normalizeMetadataKey(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;

  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function metadataHasQaFlag(metadata: SeoMetadata | null | undefined): boolean {
  if (!metadata) return false;

  return Object.entries(metadata).some(([key, value]) => {
    if (QA_METADATA_KEYS.has(normalizeMetadataKey(key)) && isTruthyFlag(value)) {
      return true;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return metadataHasQaFlag(value as SeoMetadata);
    }

    return false;
  });
}

function metadataText(value: unknown, depth = 0): string[] {
  if (!value || depth > 2) return [];
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => metadataText(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value as SeoMetadata).flatMap((entry) =>
      metadataText(entry, depth + 1),
    );
  }

  return [];
}

function searchableProductText(product: SeoProductLike): string {
  return [
    product.name,
    product.slug,
    product.storyTitle,
    product.storyNarrative,
    ...metadataText(product.metadata),
  ]
    .filter(Boolean)
    .join(" ");
}

export function isQaTestProduct(product: SeoProductLike): boolean {
  if (product.status && product.status !== "published") return true;
  if (metadataHasQaFlag(product.metadata)) return true;

  const text = searchableProductText(product);

  if (PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return (
    typeof product.pricePaise === "number" &&
    product.pricePaise <= TEST_PRICE_THRESHOLD_PAISE
  );
}

export const isQaOrPlaceholderProduct = isQaTestProduct;

export function isSeoEligibleProduct(product: SeoProductLike): boolean {
  const name = product.name?.trim();

  if (!product.slug) return false;
  if (!name) return false;
  if (product.status && product.status !== "published") return false;
  if (typeof product.pricePaise !== "number") return false;
  if (product.pricePaise <= TEST_PRICE_THRESHOLD_PAISE) return false;

  return !isQaTestProduct(product);
}

export function shouldIncludeProductInSeo(product: SeoProductLike): boolean {
  if (!isSeoEligibleProduct(product)) return false;
  if (product.stockStatus === "sold") return false;

  return true;
}

export function shouldEmitProductJsonLd(product: SeoProductLike): boolean {
  return isSeoEligibleProduct(product);
}

export function productSeoRobots(product: SeoProductLike) {
  return shouldEmitProductJsonLd(product)
    ? { index: true, follow: true }
    : { index: false, follow: true };
}
