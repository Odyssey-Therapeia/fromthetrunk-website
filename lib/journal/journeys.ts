/**
 * Journeys and next actions, keyed by article slug.
 *
 * A journey is a reading path through the Journal. The index shows one section
 * per journey that has at least one published story, in the order below, and
 * each article names its journey in the breadcrumb. Slugs listed here that are
 * not published yet are simply skipped, so any subset of the planned stories
 * renders cleanly. A published story missing from every journey still shows,
 * in a closing "More stories" section.
 *
 * Client-safe: no server imports.
 */

import { JOURNAL_LABEL, JOURNAL_PATH } from "@/lib/journal/constants";

export type JournalJourneyId = "understand-preloved" | "buy-with-confidence" | "care" | "sell";

export type JournalJourney = {
  id: JournalJourneyId;
  label: string;
  description: string;
  slugs: readonly string[];
};

export const JOURNAL_JOURNEYS: readonly JournalJourney[] = [
  {
    id: "understand-preloved",
    label: "Understand Preloved",
    description: "What preloved means for a saree, and the fabrics and weaves you will meet.",
    slugs: ["preloved-sarees-meaning", "indian-saree-fabrics-and-weaves"],
  },
  {
    id: "buy-with-confidence",
    label: "Buy with Confidence",
    description: "How to tell pure silk, what the Silk Mark promises, and buying preloved online.",
    slugs: [
      "how-to-identify-pure-silk-saree",
      "what-is-the-silk-mark",
      "buying-second-hand-sarees-online",
    ],
  },
  {
    id: "care",
    label: "Care for Your Sarees",
    description: "Folding, storing and cleaning, so a saree lasts for the next wardrobe.",
    slugs: ["how-to-care-for-silk-sarees", "how-to-care-for-sarees"],
  },
  {
    id: "sell",
    label: "Sell or Pass It On",
    description: "Where an old silk saree can go next, and what to know before it leaves.",
    slugs: ["where-to-sell-old-silk-sarees"],
  },
];

/** Every slug a journey plans for, published or not. */
export const JOURNAL_PLANNED_SLUGS: readonly string[] = JOURNAL_JOURNEYS.flatMap(
  (journey) => journey.slugs,
);

export function journalJourneyAnchor(id: JournalJourneyId): string {
  return `journey-${id}`;
}

export function journeyForSlug(slug: string): JournalJourney | null {
  return JOURNAL_JOURNEYS.find((journey) => journey.slugs.includes(slug)) ?? null;
}

/**
 * Home › Journal › Journey, the trail an article shows and its BreadcrumbList
 * repeats. The title is the H1, so it is not a crumb; an article outside every
 * journey, and the index itself, stop at Journal.
 */
export function journalBreadcrumbTrail(slug?: string): { label: string; href: string }[] {
  const journey = slug ? journeyForSlug(slug) : null;
  return [
    { label: "Home", href: "/" },
    { label: JOURNAL_LABEL, href: JOURNAL_PATH },
    ...(journey ? [{ label: journey.label, href: `${JOURNAL_PATH}#${journalJourneyAnchor(journey.id)}` }] : []),
  ];
}

export type JournalJourneyGroup<T> = { journey: JournalJourney; articles: T[] };

/**
 * Published articles grouped by journey, in journey order and each journey's
 * reading order. Journeys with no published article are left out.
 */
export function groupJournalJourneys<T extends { slug: string }>(
  articles: readonly T[],
): { groups: JournalJourneyGroup<T>[]; unassigned: T[] } {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const groups = JOURNAL_JOURNEYS.map((journey) => ({
    journey,
    articles: journey.slugs.flatMap((slug) => bySlug.get(slug) ?? []),
  })).filter((group) => group.articles.length > 0);
  const unassigned = articles.filter((article) => !JOURNAL_PLANNED_SLUGS.includes(article.slug));
  return { groups, unassigned };
}

/**
 * Up to `limit` stories to read next: the rest of this story's journey first,
 * then the next journey that has stories, then the newest of the rest.
 * `articles` must be published stories, newest first.
 */
export function rankJournalNextReads<T extends { slug: string }>(
  slug: string,
  articles: readonly T[],
  limit = 3,
): T[] {
  const { groups } = groupJournalJourneys(articles);
  const index = groups.findIndex((group) => group.journey.slugs.includes(slug));
  const sameJourney = index >= 0 ? groups[index].articles : [];
  const nextJourney = index >= 0 && groups.length > 1 ? groups[(index + 1) % groups.length].articles : [];

  const ranked: T[] = [];
  for (const article of [...sameJourney, ...nextJourney, ...articles]) {
    if (article.slug === slug || ranked.includes(article)) continue;
    ranked.push(article);
    if (ranked.length === limit) break;
  }
  return ranked;
}

export type JournalNextAction = {
  heading: string;
  description: string;
  /** The single call to action. */
  label: string;
  href: string;
  /**
   * When present, the action is a choice of destinations (one link per fabric
   * hub) introduced by `label`, instead of a single button to `href`.
   */
  options?: readonly { label: string; href: string }[];
};

const BROWSE_COLLECTION: JournalNextAction = {
  heading: "Explore the collection",
  description: "Authenticated preloved and vintage sarees, each one of one, described honestly.",
  label: "Browse the collection",
  href: "/collection",
};

const SELL_OR_CONSIGN: JournalNextAction = {
  heading: "Ready to let a saree go?",
  description: "Tell us about the saree. We will say plainly whether we can take it, and how.",
  label: "Sell or consign a saree",
  href: "/sell-your-saree",
};

/** Fabric hubs under /collection/fabric/[fabric]. */
export const JOURNAL_FABRIC_HUBS = [
  { label: "Silk", href: "/collection/fabric/silk" },
  { label: "Kanjeevaram", href: "/collection/fabric/kanjeevaram" },
  { label: "Chiffon", href: "/collection/fabric/chiffon" },
  { label: "Georgette", href: "/collection/fabric/georgette" },
] as const;

const NEXT_ACTIONS: Record<string, JournalNextAction> = {
  "preloved-sarees-meaning": {
    ...BROWSE_COLLECTION,
    heading: "See preloved done properly",
    label: "Browse preloved sarees",
  },
  "how-to-identify-pure-silk-saree": {
    heading: "What we look at before we list",
    description: "The hands-on checks every saree goes through with us, and how we describe what we find.",
    label: "How we check a saree",
    href: "/authentication",
  },
  "how-to-care-for-silk-sarees": {
    ...SELL_OR_CONSIGN,
    heading: "A well-kept saree you no longer wear?",
    description: "Silk cared for like this can go on to another wardrobe. Tell us about it and we will say plainly whether we can take it.",
  },
  "what-is-the-silk-mark": BROWSE_COLLECTION,
  "where-to-sell-old-silk-sarees": SELL_OR_CONSIGN,
  "buying-second-hand-sarees-online": {
    ...BROWSE_COLLECTION,
    label: "Browse preloved sarees",
  },
  "indian-saree-fabrics-and-weaves": {
    heading: "Find the weave you read about",
    description: "Preloved sarees grouped by fabric, each with its condition and story.",
    label: "Shop by fabric",
    href: JOURNAL_FABRIC_HUBS[0].href,
    options: JOURNAL_FABRIC_HUBS,
  },
  "how-to-care-for-sarees": BROWSE_COLLECTION,
};

/** The one next action at the end of an article; the collection by default. */
export function journalNextAction(slug: string): JournalNextAction {
  return NEXT_ACTIONS[slug] ?? BROWSE_COLLECTION;
}
