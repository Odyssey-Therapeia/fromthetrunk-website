import type { ProductWithRelations } from "@/db/queries/products";
import {
  resolveProductRowStockStatus,
  type StockStatus,
} from "@/db/inventory";
import {
  MEDIA_DERIVATIVE_BUDGETS,
  isApprovedMediaUrl,
  type MediaDerivativeLike,
  type MediaDerivativeRole,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";
import {
  resolveCurrentProductImage,
  resolvePrimaryCurrentProductImage,
} from "@/lib/media/product-image-resolver";
import { isBlouseProduct } from "@/lib/products/product-type";
import {
  MAX_PRODUCT_REFERENCE_EDGE,
  MAX_PRODUCT_REFERENCE_PIXELS,
  MAX_PRODUCT_SOURCE_BYTES,
  MAX_TRYON_IMAGE_EDGE,
  MAX_TRYON_IMAGE_PIXELS,
} from "@/lib/drape-room/server/image-limits";
import { DRAPE_REFERENCE_CONTRACT_VERSION } from "@/lib/drape-room/reference-contract";

export type DrapeSaree = {
  productId: string;
  productSlug: string;
  productName: string;
  fabric: string | null;
  pricePaise: number;
  /**
   * Catalogue listing price before markdown, in paise. Optional so previously
   * cached Drape Room renders deserialise unchanged; the live selection always
   * carries it because it is projected fresh from the product row.
   */
  originalPricePaise?: null | number;
  stockStatus: StockStatus;
  displayImageUrl: string;
  productImageId: string;
  productReferenceVersion: string;
  /** False for a storefront entry whose paid-generation reference is pending. */
  generationReady?: boolean;
};

export type DrapeSareeEligibilityReason =
  | "draft"
  | "blouse"
  | "unavailable"
  | "missing_reference"
  | "unapproved_reference";

export type DrapeSareeProjection =
  | { eligible: true; saree: DrapeSaree }
  | { eligible: false; reason: DrapeSareeEligibilityReason };

export type DrapeRoomEntryProjection = DrapeSareeProjection;

export type DrapeProductReferenceSource = {
  byteSize: number;
  height: number;
  kind: "derivative" | "source";
  mediaId: string;
  /**
   * True when the catalogue original is larger than a browser-supplied image
   * may be, so the server downscales it to a bounded working image before
   * validating and normalizing it. Derivatives are already bounded.
   */
  needsDownscale?: boolean;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** SHA-256 identity of the authoritative source bytes, when available. */
  sourceHash: string | null;
  url: string;
  version: string;
  width: number;
};

export type DrapeProductReferenceSet =
  | {
      mode: "single";
      /** IMAGE 2: the sole trusted product reference. */
      primary: DrapeProductReferenceSource;
      references: [DrapeProductReferenceSource];
      /** Compact identity covering the selected server-owned source version. */
      version: string;
    }
  | {
      mode: "dual";
      /** IMAGE 2: strongest available drape / full-look reference. */
      primary: DrapeProductReferenceSource;
      /** IMAGE 3: strongest complementary textile-detail reference. */
      detail: DrapeProductReferenceSource;
      references: [
        DrapeProductReferenceSource,
        DrapeProductReferenceSource,
      ];
      /** Compact identity covering both selected server-owned source versions. */
      version: string;
    };

const TRYON_SOURCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const DRAPE_DERIVATIVE_PRIORITY = [
  "pdp",
  "seo_master",
  "feed",
  "card",
] as const satisfies readonly MediaDerivativeRole[];

const isCurrentSafeDerivative = (
  derivative: MediaDerivativeLike,
  sourceUpdatedAt: Date | string | null | undefined,
): boolean => {
  if (!derivative.role) return false;
  const budget = MEDIA_DERIVATIVE_BUDGETS[derivative.role];
  return (
    DRAPE_DERIVATIVE_PRIORITY.includes(
      derivative.role as (typeof DRAPE_DERIVATIVE_PRIORITY)[number],
    ) &&
    validateReadyMediaDerivative(derivative).valid &&
    typeof derivative.url === "string" &&
    isApprovedMediaUrl(derivative.url) &&
    typeof derivative.sourceHash === "string" &&
    /^[a-f0-9]{64}$/i.test(derivative.sourceHash) &&
    typeof derivative.byteSize === "number" &&
    typeof derivative.width === "number" &&
    typeof derivative.height === "number" &&
    derivative.mimeType === budget.mimeType &&
    timestampVersion(derivative.sourceUpdatedAt) ===
      timestampVersion(sourceUpdatedAt)
  );
};

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const timestampVersion = (value: Date | string | null | undefined): string => {
  if (!value) return "0";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? "0" : parsed.getTime().toString(36);
};

type RankedDrapeProductReference = {
  reference: DrapeProductReferenceSource;
  searchText: string;
  sortOrder: number;
};

const FULL_LOOK_TERMS = [
  "full body",
  "full-body",
  "full length",
  "full-length",
  "draped",
  "worn",
  "model",
  "front",
  "look",
] as const;

// Unambiguous textile-detail vocabulary. A hit here is genuine evidence that
// the image was shot to show the cloth itself, so only these terms may QUALIFY
// a second image for dual mode.
const STRONG_DETAIL_TERMS = [
  "detail",
  "close up",
  "close-up",
  "border",
  "pallu",
  "motif",
  "weave",
  "texture",
  "zari",
] as const;

// "design" and "pattern" are real detail words but far too generic to stand
// alone: they appear constantly in storage keys and export filenames
// ("saree-design-2.jpg", "media/pattern/…") with no textile-detail meaning, and
// keywordScore matches substrings, so "designer" and "patterned" hit too. They
// still add supporting score once a strong term has qualified the image, but on
// their own they must never buy a third provider image.
const DETAIL_TERMS = [
  ...STRONG_DETAIL_TERMS,
  "pattern",
  "design",
] as const;

// A second distinct gallery image is not automatically useful to the model.
// The reviewed threshold requires explicit textile-detail language plus enough
// supporting score (detail framing/resolution or multiple detail terms) before
// paying for and sending IMAGE 3. Two ordinary full-look images stay single.
const MIN_COMPLEMENTARY_DETAIL_SCORE = 45;

const keywordScore = (text: string, terms: readonly string[]): number =>
  terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);

const resolutionScore = (reference: DrapeProductReferenceSource): number =>
  Math.min(8, Math.floor(Math.sqrt(reference.width * reference.height) / 500));

const fullLookScore = (candidate: RankedDrapeProductReference): number => {
  const ratio = candidate.reference.height / candidate.reference.width;
  return (
    keywordScore(candidate.searchText, FULL_LOOK_TERMS) * 30 -
    keywordScore(candidate.searchText, DETAIL_TERMS) * 8 +
    (ratio >= 1.15 && ratio <= 2.2 ? 20 : 0) +
    resolutionScore(candidate.reference) -
    Math.min(12, Math.max(0, candidate.sortOrder))
  );
};

const detailScore = (candidate: RankedDrapeProductReference): number => {
  const ratio = candidate.reference.height / candidate.reference.width;
  return (
    keywordScore(candidate.searchText, DETAIL_TERMS) * 35 +
    (ratio >= 0.7 && ratio <= 1.45 ? 10 : 0) +
    resolutionScore(candidate.reference) -
    Math.min(12, Math.max(0, candidate.sortOrder))
  );
};

// Both arms are load-bearing, and neither alone is sufficient:
//   - a STRONG term proves the image is *about* the textile, not merely a
//     second view of the same look;
//   - the score proves the shot is actually usable as IMAGE 3 (framing and
//     resolution), so a stray keyword on a thumbnail cannot buy a third image.
// Without a strong term the product stays in single mode, which is the correct
// default: IMAGE 3 costs a provider image on every generation.
const hasComplementaryDetailEvidence = (
  candidate: RankedDrapeProductReference,
): boolean =>
  keywordScore(candidate.searchText, STRONG_DETAIL_TERMS) > 0 &&
  detailScore(candidate) >= MIN_COMPLEMENTARY_DETAIL_SCORE;

// Deterministic cache fingerprint, not a security primitive. Authoritative
// media identity and versions remain server-owned and are included as input.
const referenceFingerprint = (value: string): string => {
  const hash = (input: string) => {
    let result = 5381;
    for (let index = 0; index < input.length; index += 1) {
      result = ((result << 5) + result + input.charCodeAt(index)) >>> 0;
    }
    return result.toString(16).padStart(8, "0");
  };
  return `${hash(value)}${hash([...value].reverse().join(""))}`;
};

/** Resolve one gallery relation to a trusted generation source. */
function resolveDrapeImageReference(
  imageRelation: ProductWithRelations["images"][number],
): DrapeProductReferenceSource | null {
  const readyDerivative = DRAPE_DERIVATIVE_PRIORITY.flatMap((role) =>
    (imageRelation.media.derivatives ?? []).filter(
      (derivative) =>
        derivative.role === role &&
        isCurrentSafeDerivative(derivative, imageRelation.media.updatedAt),
    ),
  )[0];
  if (
    readyDerivative?.url &&
    readyDerivative.role &&
    readyDerivative.mimeType &&
    TRYON_SOURCE_MIME_TYPES.has(readyDerivative.mimeType) &&
    positiveInteger(readyDerivative.byteSize) &&
    positiveInteger(readyDerivative.width) &&
    positiveInteger(readyDerivative.height)
  ) {
    return {
      byteSize: readyDerivative.byteSize,
      height: readyDerivative.height,
      kind: "derivative",
      mediaId: imageRelation.media.id,
      mimeType:
        readyDerivative.mimeType as DrapeProductReferenceSource["mimeType"],
      sourceHash: readyDerivative.sourceHash,
      url: readyDerivative.url,
      version: [
        "derivative",
        readyDerivative.role,
        imageRelation.media.id,
        readyDerivative.sourceHash,
        `v${readyDerivative.generationVersion}`,
        timestampVersion(readyDerivative.sourceUpdatedAt),
        readyDerivative.byteSize,
        `${readyDerivative.width}x${readyDerivative.height}`,
      ].join(":"),
      width: readyDerivative.width,
    };
  }

  const current = resolveCurrentProductImage(imageRelation, "pdp").image;
  if (
    !current ||
    current.mediaId !== imageRelation.media.id ||
    !current.mimeType ||
    !TRYON_SOURCE_MIME_TYPES.has(current.mimeType) ||
    !positiveInteger(current.filesize) ||
    current.filesize > MAX_PRODUCT_SOURCE_BYTES ||
    !positiveInteger(current.width) ||
    !positiveInteger(current.height) ||
    Math.min(current.width, current.height) < 600 ||
    current.width > MAX_PRODUCT_REFERENCE_EDGE ||
    current.height > MAX_PRODUCT_REFERENCE_EDGE ||
    current.width * current.height > MAX_PRODUCT_REFERENCE_PIXELS ||
    !isApprovedMediaUrl(current.url)
  ) {
    return null;
  }

  return {
    byteSize: current.filesize,
    height: current.height,
    kind: "source",
    mediaId: imageRelation.media.id,
    needsDownscale:
      current.width > MAX_TRYON_IMAGE_EDGE ||
      current.height > MAX_TRYON_IMAGE_EDGE ||
      current.width * current.height > MAX_TRYON_IMAGE_PIXELS,
    mimeType: current.mimeType as DrapeProductReferenceSource["mimeType"],
    sourceHash:
      typeof imageRelation.media.metadata?.sourceSha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(imageRelation.media.metadata.sourceSha256)
        ? imageRelation.media.metadata.sourceSha256.toLowerCase()
        : null,
    url: current.url,
    version: [
      "source",
      imageRelation.media.id,
      typeof imageRelation.media.metadata?.sourceSha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(imageRelation.media.metadata.sourceSha256)
        ? imageRelation.media.metadata.sourceSha256.toLowerCase()
        : "nohash",
      timestampVersion(imageRelation.media.updatedAt),
      current.filesize,
      `${current.width}x${current.height}`,
    ].join(":"),
    width: current.width,
  };
}

/**
 * Select one or two trusted references from the complete product gallery.
 * IMAGE 2 prefers a full-look/drape view; an optional IMAGE 3 prefers textile detail.
 * Metadata, shape, resolution, and gallery order form a deterministic score.
 * A one-image product remains eligible without duplicating its sole trusted
 * source or accepting a browser-controlled URL.
 */
export function resolveDrapeProductReferences(
  product: ProductWithRelations,
): DrapeProductReferenceSet | null {
  const candidates = [...product.images]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((imageRelation): RankedDrapeProductReference[] => {
      const reference = resolveDrapeImageReference(imageRelation);
      if (!reference) return [];
      return [
        {
          reference,
          searchText: [
            imageRelation.media.alt,
            imageRelation.media.filename,
            imageRelation.media.key,
          ]
            .filter((value): value is string => typeof value === "string")
            .join(" ")
            .toLowerCase(),
          sortOrder: imageRelation.sortOrder,
        },
      ];
    })
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) =>
            other.reference.mediaId === candidate.reference.mediaId ||
            (other.reference.sourceHash !== null &&
              candidate.reference.sourceHash !== null &&
              other.reference.sourceHash === candidate.reference.sourceHash) ||
            // Media ID and source hash remain authoritative. Exact canonical
            // URL equality is a defensive fallback for legacy rows whose
            // source hash predates upload-time hashing.
            new URL(other.reference.url).href ===
              new URL(candidate.reference.url).href,
        ) === index,
    );
  if (candidates.length === 0) return null;

  const primaryCandidate = [...candidates].sort(
    (left, right) =>
      fullLookScore(right) - fullLookScore(left) ||
      left.sortOrder - right.sortOrder ||
      left.reference.mediaId.localeCompare(right.reference.mediaId),
  )[0]!;
  const detailCandidate = [...candidates]
    .filter(
      (candidate) =>
        candidate.reference.mediaId !== primaryCandidate.reference.mediaId &&
        hasComplementaryDetailEvidence(candidate),
    )
    .sort(
      (left, right) =>
        detailScore(right) - detailScore(left) ||
        left.sortOrder - right.sortOrder ||
        left.reference.mediaId.localeCompare(right.reference.mediaId),
    )[0];
  if (!detailCandidate) {
    return {
      mode: "single",
      primary: primaryCandidate.reference,
      references: [primaryCandidate.reference],
      version: [
        DRAPE_REFERENCE_CONTRACT_VERSION,
        "single",
        primaryCandidate.reference.mediaId,
        referenceFingerprint(primaryCandidate.reference.version),
      ].join(":"),
    };
  }

  const sourceIdentity = [
    primaryCandidate.reference.version,
    detailCandidate.reference.version,
  ].join("|");
  return {
    mode: "dual",
    primary: primaryCandidate.reference,
    references: [
      primaryCandidate.reference,
      detailCandidate.reference,
    ],
    detail: detailCandidate.reference,
    version: [
      DRAPE_REFERENCE_CONTRACT_VERSION,
      "dual",
      primaryCandidate.reference.mediaId,
      detailCandidate.reference.mediaId,
      referenceFingerprint(sourceIdentity),
    ].join(":"),
  };
}

/**
 * Build the smallest serialisable product shape the Drape Room may keep in its
 * client store. The generation route resolves all of this again from productId;
 * none of these browser values are trusted for a paid request.
 */
export function projectDrapeSaree(
  product: ProductWithRelations,
  now = new Date(),
): DrapeSareeProjection {
  if (product.status !== "published") return { eligible: false, reason: "draft" };
  if (isBlouseProduct(product)) return { eligible: false, reason: "blouse" };

  const stockStatus = resolveProductRowStockStatus(product, now);
  if (stockStatus !== "available") {
    return { eligible: false, reason: "unavailable" };
  }

  if (product.images.length === 0) {
    return { eligible: false, reason: "missing_reference" };
  }
  const references = resolveDrapeProductReferences(product);
  if (!references) {
    const display = resolvePrimaryCurrentProductImage(product, "pdp").image;
    return {
      eligible: false,
      reason:
        display && !isApprovedMediaUrl(display.url)
          ? "unapproved_reference"
          : "missing_reference",
    };
  }

  return {
    eligible: true,
    saree: {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      fabric: product.detailsFabric,
      pricePaise: product.pricePaise,
      originalPricePaise: product.originalPricePaise ?? null,
      stockStatus,
      displayImageUrl: references.primary.url,
      productImageId: references.primary.mediaId,
      productReferenceVersion: references.version,
      generationReady: true,
    },
  };
}

/**
 * Project a discoverable storefront entry without weakening the paid request.
 *
 * A product with incomplete or unapproved source metadata can still expose the
 * AI-star and an honest readiness state. Paid generation always re-resolves
 * the product and its approved reference from productId on the server.
 */
export function projectDrapeRoomEntry(
  product: ProductWithRelations,
  now = new Date(),
): DrapeRoomEntryProjection {
  const generationProjection = projectDrapeSaree(product, now);
  if (generationProjection.eligible) return generationProjection;
  if (
    generationProjection.reason === "draft" ||
    generationProjection.reason === "blouse" ||
    generationProjection.reason === "unavailable"
  ) {
    return generationProjection;
  }

  // Entry visibility must follow the complete gallery, not only relation zero.
  // Legacy catalogue rows can have an oversized first original while a later
  // image is already safe for storefront display. The card resolver scans the
  // complete ordered gallery and prefers a bounded derivative/variant before
  // falling back to the smallest approved current original.
  const displayImage = resolvePrimaryCurrentProductImage(product, "card").image;
  if (!displayImage?.mediaId) {
    return { eligible: false, reason: "missing_reference" };
  }
  const displayImageBelongsToProduct = product.images.some(
    (imageRelation) => imageRelation.media.id === displayImage.mediaId,
  );
  if (
    !displayImageBelongsToProduct ||
    !isApprovedMediaUrl(displayImage.url)
  ) {
    return { eligible: false, reason: "unapproved_reference" };
  }

  return {
    eligible: true,
    saree: {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      fabric: product.detailsFabric,
      pricePaise: product.pricePaise,
      originalPricePaise: product.originalPricePaise ?? null,
      stockStatus: "available",
      displayImageUrl: displayImage.url,
      productImageId: displayImage.mediaId,
      productReferenceVersion: `display-only:${displayImage.mediaId}`,
      generationReady: false,
    },
  };
}
