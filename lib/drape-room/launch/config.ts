/**
 * Single source of truth for the Drape Room launch campaign.
 *
 * Copy, the CTA destination, trigger thresholds, route exclusions and the
 * session key all live here so the campaign can be retuned from one file. No
 * component may hardcode this copy.
 */

export type DrapeAnnouncementVariant = "evergreen" | "launch";

function readVariant(): DrapeAnnouncementVariant {
  return process.env.NEXT_PUBLIC_DRAPE_ANNOUNCEMENT_VARIANT === "evergreen"
    ? "evergreen"
    : "launch";
}

/**
 * There is no `/drape-room` page: the Drape Room is a store-driven modal that
 * needs a selected saree. The announcement therefore sends shoppers to the
 * catalogue, where every eligible card carries its own Drape Room trigger.
 */
const CTA_HREF = "/collection";

/** In-page target for the catalogue teaser's primary action. */
const COLLECTION_GRID_HREF = "#collection-grid";

const ANNOUNCEMENT_MESSAGE: Record<DrapeAnnouncementVariant, string> = {
  launch:
    "NEW · THE DRAPE ROOM IS OPEN — See yourself in the saree you love. Try it now →",
  evergreen: "THE DRAPE ROOM · Try any saree on yourself →",
};

/**
 * Route prefixes that must never show any Drape Room launch surface. Matched
 * against the real route tree, not guessed: transactional and account flows
 * plus the admin group.
 */
const EXCLUDED_ROUTE_PREFIXES = [
  "/cart",
  "/checkout",
  "/account",
  "/admin",
  "/search",
] as const;

export const drapeLaunchConfig = {
  announcementVariant: readVariant(),
  announcementMessage: ANNOUNCEMENT_MESSAGE,
  ctaHref: CTA_HREF,
  collectionGridHref: COLLECTION_GRID_HREF,
  excludedRoutePrefixes: EXCLUDED_ROUTE_PREFIXES,

  /** Auto-open thresholds. Whichever fires first wins. */
  trigger: {
    dwellMs: 7_000,
    /** The catalogue has no selected saree, so it opens sooner. */
    collectionDwellMs: 5_000,
    scrollProgress: 0.35,
    distinctGalleryImages: 2,
    /** Short settle delay so the sheet never lands mid-interaction. */
    idleDelayMs: 600,
  },

  /** Versioned so a future campaign can legitimately show the teaser again. */
  sessionKey: "ftt:drape-room:teaser-shown:v1",

  /**
   * Animated AVIF image sequences (ftyp brand `avis`). Next/Image would flatten
   * them to a single frame, so they are served straight from /public through a
   * native <picture>. Intrinsic sizes are declared to reserve layout space.
   */
  media: {
    desktop: { src: "/drape-room/launchDrape.avif", width: 1920, height: 1080 },
    mobile: { src: "/drape-room/mobileLaunchDrape.avif", width: 1080, height: 1920 },
    alt: "See how The Drape Room creates a personal saree preview",
    /** Below this width the portrait asset is used. */
    mobileMaxWidthPx: 767,
  },

  copy: {
    label: "THE DRAPE ROOM",
    heading: "See this saree on you",
    body: "Choose this saree, add a clear photo, give consent, and create your personal drape preview.",
    steps: [
      "Choose saree",
      "Add photo",
      "Give consent",
      "Create preview",
    ] as const,
    primaryCta: "Try this saree on me",
    secondaryCta: "Not now",
    privacy:
      "Your photo is used only to create your preview. Delete anytime.",
    disclaimer:
      "AI-generated style preview. Actual colour, texture, proportions and drape may vary.",
    selectedBadge: "Selected",
    /** Shown on the catalogue, where no saree has been chosen yet. */
    collectionHeading: "See a saree on you",
    collectionBody:
      "Pick any saree below, add a clear photo, give consent, and create your personal drape preview.",
    collectionPrimaryCta: "Browse sarees to try",
  },
} as const;

/** True when no Drape Room launch surface may render on this path. */
export function isDrapeLaunchExcludedRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return drapeLaunchConfig.excludedRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function drapeAnnouncementMessage(): string {
  return drapeLaunchConfig.announcementMessage[
    drapeLaunchConfig.announcementVariant
  ];
}
