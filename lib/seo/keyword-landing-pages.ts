import type { ProductWithRelations } from "@/db/queries/products";
import {
  expandFabricAliases,
  normalizeFacetSlug,
} from "@/lib/catalog/filter-taxonomy";
import type { CatalogSearchFilters } from "@/lib/ports/catalog-search";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site-url";

export type KeywordLandingType =
  | "fabric"
  | "colour"
  | "occasion"
  | "blouse"
  | "guide"
  | "supply";

export type KeywordLandingFaq = {
  answer: string;
  question: string;
};

/**
 * The product grid shown straight after a landing page's introduction.
 * `relatedEdit` names the slug of the closest landing page of the same type;
 * its pieces are shown, under that page's own heading, only when this page
 * has none available.
 */
export type KeywordLandingProductSection = {
  heading: string;
  viewAllHref: string;
  viewAllLabel: string;
  relatedEdit?: string;
};

export type KeywordLandingConfig = {
  canonicalPath: string;
  description: string;
  faq: KeywordLandingFaq[];
  h1: string;
  indexableWithoutProducts?: boolean;
  intro: string[];
  minProductCount: number;
  primaryKeyword: string;
  productSection?: KeywordLandingProductSection;
  related: Array<{ href: string; label: string }>;
  searchFilters?: CatalogSearchFilters;
  secondaryKeywords: string[];
  sitemap: boolean;
  slug: string;
  title: string;
  type: KeywordLandingType;
};

export const keywordLandingPages = [
  {
    slug: "silk",
    type: "fabric",
    primaryKeyword: "preloved silk saree",
    secondaryKeywords: [
      "vintage silk saree",
      "pre owned silk saree",
      "second hand silk saree",
      "pre loved luxury sarees",
    ],
    title: "Preloved Silk Sarees Online India",
    description:
      "Shop authenticated preloved silk sarees from From the Trunk: restored, story-logged, and ready for another life.",
    h1: "Preloved silk sarees, authenticated and re-stored",
    intro: [
      "Silk is where many saree stories begin: wedding trunks, festive mornings, heirloom gifts, and pieces kept carefully for years. This edit gathers preloved silk sarees that have been checked, restored where needed, and prepared for a new wardrobe without pretending they are newly made.",
      "Every listed piece is one of one. We document condition, fabric, provenance where available, and visible signs of age so you can choose with clarity. If you are looking for vintage silk sarees online in India, start here for pieces with craft, memory, and a lighter footprint than buying new.",
    ],
    faq: [
      {
        question: "Are these silk sarees new?",
        answer:
          "No. They are preloved or vintage pieces that From the Trunk authenticates, condition-checks, and restores before listing.",
      },
      {
        question: "How should I care for a preloved silk saree?",
        answer:
          "Dry clean only, store folded in breathable muslin, and keep it away from direct sunlight and humidity.",
      },
    ],
    canonicalPath: "/collection/fabric/silk",
    sitemap: true,
    minProductCount: 3,
    searchFilters: {
      fabrics: ["silk"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Silk sarees in the trunk",
      viewAllHref: "/collection?fabric=silk",
      viewAllLabel: "View all silk sarees",
      relatedEdit: "kanjeevaram",
    },
    related: [
      { href: "/collection/occasion/festive", label: "Festive sarees" },
      { href: "/journal/preloved-sarees-meaning", label: "What preloved means" },
      { href: "/sell-your-saree", label: "Sell a silk saree" },
      { href: "/journal/indian-saree-fabrics-and-weaves", label: "Guide to saree weaves" },
      { href: "/journal/how-to-identify-pure-silk-saree", label: "How to identify pure silk" },
    ],
  },
  {
    slug: "kanjeevaram",
    type: "fabric",
    primaryKeyword: "preloved kanjeevaram saree",
    secondaryKeywords: [
      "vintage kanjeevaram saree",
      "second hand kanjeevaram saree",
      "pre owned kanjivaram silk saree",
    ],
    title: "Preloved Kanjeevaram Sarees",
    description:
      "Explore authenticated preloved Kanjeevaram sarees, condition-checked and prepared for a second story.",
    h1: "Preloved Kanjeevaram sarees with ceremonial presence",
    intro: [
      "A Kanjeevaram saree carries weight in every sense: silk, zari, occasion, and memory. This edit gathers Kanjeevaram and Kanjivaram-style pieces that meet the From the Trunk standard for authentication and condition clarity.",
      "Every piece is sourced one by one, so this edit stays small and changes often. Each saree carries its own condition notes and story, and new pieces join the trunk as they pass our checks.",
    ],
    faq: [
      {
        question: "Why are there only a few Kanjeevaram sarees?",
        answer:
          "From the Trunk lists unique preloved pieces only after review, so Kanjeevaram inventory depends on what passes sourcing and condition checks.",
      },
    ],
    canonicalPath: "/collection/fabric/kanjeevaram",
    sitemap: true,
    minProductCount: 3,
    // "kanjeevaram" also finds Kanjivaram / Kanchipuram spellings and
    // "Kanjeevaram Mix" (see expandFabricAliases); products record the weave as
    // "Kanjeevaram", so a "kanjeevaram-silk" filter matched nothing.
    searchFilters: {
      fabrics: ["kanjeevaram"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Kanjeevaram sarees in the trunk",
      viewAllHref: "/collection?fabric=kanjeevaram",
      viewAllLabel: "View all Kanjeevaram sarees",
      relatedEdit: "silk",
    },
    related: [
      { href: "/collection/fabric/silk", label: "Preloved silk sarees" },
      { href: "/collection/occasion/festive", label: "Festive sarees" },
      { href: "/guides/pre-loved-vs-second-hand-saree", label: "Preloved vs second hand" },
      { href: "/journal/indian-saree-fabrics-and-weaves", label: "Guide to saree weaves" },
      { href: "/journal/how-to-identify-pure-silk-saree", label: "How to identify pure silk" },
    ],
  },
  {
    slug: "chiffon",
    type: "fabric",
    primaryKeyword: "preloved chiffon saree",
    secondaryKeywords: ["vintage chiffon saree", "soft flow saree"],
    title: "Preloved Chiffon Sarees",
    description:
      "Find light, flowing preloved chiffon sarees when available, each checked and story-logged by From the Trunk.",
    h1: "Preloved chiffon sarees with soft movement",
    intro: [
      "Chiffon sarees are loved for their light drape, gentle movement, and evening ease. This edit gathers authenticated preloved chiffon pieces, each with its own condition notes.",
      "Chiffon pieces come and go quickly, so look through what is in the trunk now, or explore georgette for a similarly fluid drape.",
    ],
    faq: [
      {
        question: "Is chiffon suitable for occasion wear?",
        answer:
          "Yes. Chiffon works well for lighter parties, dinners, and drapes where movement matters more than heavy structure.",
      },
    ],
    canonicalPath: "/collection/fabric/chiffon",
    sitemap: true,
    minProductCount: 3,
    searchFilters: {
      fabrics: ["chiffon"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Chiffon sarees in the trunk",
      viewAllHref: "/collection?fabric=chiffon",
      viewAllLabel: "View all chiffon sarees",
      relatedEdit: "georgette",
    },
    related: [
      { href: "/collection/fabric/silk", label: "Silk sarees" },
      { href: "/collection/occasion/festive", label: "Festive sarees" },
      { href: "/journal/indian-saree-fabrics-and-weaves", label: "Guide to saree weaves" },
      { href: "/journal/how-to-care-for-sarees", label: "How to care for sarees" },
    ],
  },
  {
    slug: "georgette",
    type: "fabric",
    primaryKeyword: "preloved georgette saree",
    secondaryKeywords: ["vintage georgette saree"],
    title: "Preloved Georgette Sarees",
    description:
      "Discover preloved georgette sarees from From the Trunk when this fluid fabric is available in the collection.",
    h1: "Preloved georgette sarees for fluid drape",
    intro: [
      "Georgette is often chosen for its fall: easy pleats, soft structure, and a dressed feeling without too much weight. This edit gathers authenticated preloved georgette sarees, each with its own condition notes.",
      "Every piece is one of one, so what is here changes as sarees find new homes. Chiffon offers a similarly light, flowing drape.",
    ],
    faq: [
      {
        question: "Will this page always have georgette sarees?",
        answer:
          "No. From the Trunk inventory is one of one, so fabric availability changes as pieces are sold or sourced.",
      },
    ],
    canonicalPath: "/collection/fabric/georgette",
    sitemap: true,
    minProductCount: 3,
    searchFilters: {
      fabrics: ["georgette"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Georgette sarees in the trunk",
      viewAllHref: "/collection?fabric=georgette",
      viewAllLabel: "View all georgette sarees",
      relatedEdit: "chiffon",
    },
    related: [
      { href: "/collection/fabric/chiffon", label: "Chiffon sarees" },
      { href: "/collection", label: "All sarees" },
      { href: "/journal/indian-saree-fabrics-and-weaves", label: "Guide to saree weaves" },
      { href: "/journal/how-to-care-for-sarees", label: "How to care for sarees" },
    ],
  },
  {
    slug: "wedding",
    type: "occasion",
    primaryKeyword: "preloved wedding saree",
    secondaryKeywords: ["vintage wedding saree", "sustainable wedding saree"],
    title: "Preloved Wedding Sarees",
    description:
      "Browse preloved wedding sarees when ceremonial pieces are available, with provenance and condition details.",
    h1: "Preloved wedding sarees for meaningful occasions",
    intro: [
      "A wedding saree is rarely just an outfit. It is chosen for ritual, memory, family photographs, and the feeling of carrying something significant. From the Trunk keeps wedding-intent pieces tightly curated and condition-led.",
      "Wedding-worthy pieces are rare in preloved form, so each one is chosen with care and listed with its condition, fabric, and provenance notes where known.",
    ],
    faq: [
      {
        question: "Can a preloved saree be worn for a wedding?",
        answer:
          "Yes, when condition and styling fit the occasion. From the Trunk documents each piece so buyers can choose confidently.",
      },
    ],
    canonicalPath: "/collection/occasion/wedding",
    sitemap: false,
    minProductCount: 3,
    searchFilters: {
      occasions: ["wedding"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Wedding sarees in the trunk",
      viewAllHref: "/collection?occasion=wedding",
      viewAllLabel: "View all wedding sarees",
    },
    related: [
      { href: "/collection/fabric/silk", label: "Silk sarees" },
      { href: "/collection/occasion/festive", label: "Festive sarees" },
    ],
  },
  {
    slug: "festive",
    type: "occasion",
    primaryKeyword: "festive sarees preloved",
    secondaryKeywords: [
      "party wear pre loved sarees",
      "puja sarees pre loved",
      "sustainable festive sarees",
    ],
    title: "Preloved Festive Sarees",
    description:
      "Shop authenticated preloved festive sarees for celebrations, pujas, dinners, and family occasions.",
    h1: "Preloved festive sarees for the next celebration",
    intro: [
      "Festive sarees do not need to be newly made to feel special. This edit brings together pieces suited to pujas, dinners, family gatherings, and celebratory dressing, each reviewed for condition and presented with its story where available.",
      "Choosing preloved festive sarees keeps craft in circulation and gives beautiful textiles another reason to be worn. Browse the available pieces, then check each product dossier for fabric, grade, care, and provenance notes.",
    ],
    faq: [
      {
        question: "Are preloved sarees appropriate for festivals?",
        answer:
          "Yes. Many preloved sarees are occasion pieces that were worn rarely and preserved carefully before being restored and listed.",
      },
      {
        question: "Can I gift a preloved saree?",
        answer:
          "Yes, especially when the recipient values craft, provenance, and sustainable fashion. Check the product condition notes first.",
      },
    ],
    canonicalPath: "/collection/occasion/festive",
    sitemap: true,
    minProductCount: 3,
    searchFilters: {
      occasions: ["festive"],
      excludeTypes: ["blouse"],
      availabilityStatus: "available",
    },
    productSection: {
      heading: "Festive sarees in the trunk",
      viewAllHref: "/collection?occasion=festive",
      viewAllLabel: "View all festive sarees",
    },
    related: [
      { href: "/collection/fabric/silk", label: "Silk sarees" },
      { href: "/journal/preloved-sarees-meaning", label: "What preloved means" },
      { href: "/sell-your-saree", label: "Pass on a saree" },
    ],
  },
  {
    slug: "blouses",
    type: "blouse",
    primaryKeyword: "black blouse online",
    secondaryKeywords: [
      "pre loved blouse",
      "vintage blouse",
      "saree blouse black",
      "designer blouse pre loved",
    ],
    title: "Preloved Saree Blouses",
    description:
      "Curated preloved and designer saree blouses to complete your drape — authenticated, one-of-a-kind pieces from From The Trunk.",
    h1: "Preloved & Designer Saree Blouses",
    intro: [
      "Blouses need fit, fabric, and styling clarity, so From the Trunk keeps blouse discovery separate from saree-only searches. New pieces are added here as they are authenticated and restored.",
      "When available, pieces are shown with the same care standards: visible condition, product details, and no hidden ownership assumptions.",
    ],
    faq: [
      {
        question: "How often are new blouses added?",
        answer:
          "New pieces are listed as they are authenticated and restored, so availability changes often — browse the full collection meanwhile and check back soon.",
      },
    ],
    canonicalPath: "/blouses",
    sitemap: true,
    minProductCount: 1,
    searchFilters: { types: ["blouse"], availabilityStatus: "available" },
    productSection: {
      heading: "Blouses in the trunk",
      viewAllHref: "/collection?type=blouse",
      viewAllLabel: "View all blouses",
    },
    related: [
      { href: "/collection", label: "All sarees" },
      { href: "/collection/fabric/silk", label: "Silk sarees" },
    ],
  },
  {
    slug: "sell-your-saree",
    type: "supply",
    primaryKeyword: "sell old sarees online",
    secondaryKeywords: [
      "where to sell old sarees",
      "sell sarees online India",
      "saree consignment India",
      "sell vintage sarees India",
    ],
    title: "Sell Your Old Sarees Online",
    description:
      "Pass on old, vintage, or heirloom sarees through From the Trunk. Learn what we accept and how our review process works.",
    h1: "Sell or consign sarees with a second story",
    intro: [
      "Some sarees are too beautiful to stay folded away, but too meaningful to treat like ordinary resale. From the Trunk helps custodians pass on preloved, vintage, and heirloom sarees through a careful review process built around condition, provenance, and respect for the textile.",
      "We are especially interested in silk, Kanjeevaram, Banarasi, chiffon, georgette, cotton silk, and distinctive occasion sarees with a story. Share clear photos and any known history; our team will review whether the piece is right for the trunk.",
    ],
    faq: [
      {
        question: "How do I sell my old saree?",
        answer:
          "If you have sarees sitting unworn — silks, chiffons, designer pieces, or heirlooms — we would love to hear about them. Reach out to us through From the Trunk, and we will guide you through the process. If the piece is a good fit, your saree can find a new home with someone who will truly wear it.",
      },
      {
        question: "What sarees can I submit?",
        answer:
          "We review clean, wearable sarees with strong craft, fabric, condition, or story value. Final acceptance depends on condition and fit with the current collection.",
      },
      {
        question: "Do you buy every old saree?",
        answer:
          "No. We curate carefully and only accept pieces that can be authenticated, described clearly, and passed on responsibly.",
      },
    ],
    canonicalPath: "/sell-your-saree",
    sitemap: true,
    minProductCount: 0,
    indexableWithoutProducts: true,
    related: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/collection/fabric/silk", label: "Browse silk sarees" },
      { href: "/guides/pre-loved-vs-second-hand-saree", label: "Preloved vs second hand" },
    ],
  },
  {
    slug: "what-is-a-pre-loved-saree",
    type: "guide",
    primaryKeyword: "what is a preloved saree",
    secondaryKeywords: [
      "pre loved saree meaning",
      "vintage saree meaning",
      "why buy pre loved sarees",
    ],
    title: "What Is a Preloved Saree?",
    description:
      "A clear guide to what preloved sarees mean, how they differ from ordinary second-hand pieces, and how From the Trunk prepares them.",
    h1: "What is a preloved saree?",
    intro: [
      "A preloved saree is a saree that has already belonged to someone else, but still has value, beauty, and wear left in it. The phrase matters because it shifts the focus from disposal to care: the saree was kept, worn, preserved, and is now ready for another custodian.",
      "At From the Trunk, preloved also means reviewed. We look at fabric, condition, provenance where available, and whether the piece can be presented honestly. A preloved saree may show gentle signs of age, but those details are part of the dossier rather than something hidden.",
      "Buying preloved is not only about price. It can mean owning a one-of-one piece, choosing circular fashion, and keeping textile craft in use for longer.",
    ],
    faq: [
      {
        question: "Is preloved the same as damaged?",
        answer:
          "No. Preloved means previously owned. Condition varies by piece, which is why each From the Trunk product includes condition notes.",
      },
      {
        question: "Why buy a preloved saree?",
        answer:
          "It can offer uniqueness, provenance, and lower textile waste compared with buying a newly made occasion saree.",
      },
    ],
    canonicalPath: "/guides/what-is-a-pre-loved-saree",
    sitemap: false,
    minProductCount: 0,
    indexableWithoutProducts: true,
    related: [
      { href: "/collection", label: "Browse the collection" },
      { href: "/guides/pre-loved-vs-second-hand-saree", label: "Preloved vs second hand" },
      { href: "/sell-your-saree", label: "Sell your saree" },
    ],
  },
  {
    slug: "pre-loved-vs-second-hand-saree",
    type: "guide",
    primaryKeyword: "preloved vs second hand saree",
    secondaryKeywords: [
      "second hand sarees online India",
      "authenticated pre loved sarees",
    ],
    title: "Preloved vs Second-Hand Sarees",
    description:
      "Understand how preloved sarees differ from ordinary second-hand listings, especially around condition, provenance, and curation.",
    h1: "Preloved vs second-hand sarees",
    intro: [
      "Second-hand usually means previously owned. Preloved can mean that too, but in a curated saree context it should go further: condition clarity, authentication effort, story, and respectful presentation. The difference is not a marketing shortcut; it is a responsibility to describe the textile honestly.",
      "A generic second-hand listing may focus mainly on price and availability. A From the Trunk preloved saree is treated more like a product dossier: fabric, condition grade, measurements, provenance if known, care notes, and the reason it still deserves to be worn.",
    ],
    faq: [
      {
        question: "Is preloved more expensive than second-hand?",
        answer:
          "Sometimes, because curation, authentication, restoration, and presentation add value. The final price still depends on fabric, condition, craft, and rarity.",
      },
      {
        question: "Should I search for preloved or second-hand sarees?",
        answer:
          "Use both terms when researching, but look for clear condition notes and trustworthy product information before buying.",
      },
    ],
    canonicalPath: "/guides/pre-loved-vs-second-hand-saree",
    sitemap: true,
    minProductCount: 0,
    indexableWithoutProducts: true,
    related: [
      { href: "/journal/preloved-sarees-meaning", label: "What preloved means" },
      { href: "/collection/fabric/silk", label: "Preloved silk sarees" },
      { href: "/sell-your-saree", label: "Pass on a saree" },
    ],
  },
] satisfies KeywordLandingConfig[];

export const keywordLandingByPath = new Map(
  keywordLandingPages.map((page) => [page.canonicalPath, page]),
);

export function getKeywordLandingByTypeSlug(
  type: KeywordLandingType,
  slug: string,
): KeywordLandingConfig | undefined {
  const normalized = normalizeFacetSlug(slug);
  return keywordLandingPages.find(
    (page) => page.type === type && page.slug === normalized,
  );
}

export function getGuideLanding(slug: string): KeywordLandingConfig | undefined {
  return getKeywordLandingByTypeSlug("guide", slug);
}

export function getFabricLandingForLabel(
  fabric: string,
): KeywordLandingConfig | undefined {
  const slug = normalizeFacetSlug(fabric);
  if (expandFabricAliases(["kanjeevaram"]).some((alias) => slug.includes(alias))) {
    return getKeywordLandingByTypeSlug("fabric", "kanjeevaram");
  }
  if (slug.includes("chiffon")) {
    return getKeywordLandingByTypeSlug("fabric", "chiffon");
  }
  if (slug.includes("georgette")) {
    return getKeywordLandingByTypeSlug("fabric", "georgette");
  }
  if (slug.includes("silk")) {
    return getKeywordLandingByTypeSlug("fabric", "silk");
  }
  return undefined;
}

export function isKeywordLandingIndexable(
  config: KeywordLandingConfig,
  productCount: number,
): boolean {
  if (config.indexableWithoutProducts) return true;
  return productCount >= config.minProductCount;
}

export function keywordLandingMetadata(
  config: KeywordLandingConfig,
  productCount = 0,
) {
  const indexable = isKeywordLandingIndexable(config, productCount);

  return {
    ...publicPageMetadata({
      title: config.title,
      description: config.description,
      path: config.canonicalPath,
    }),
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export function keywordBreadcrumbJsonLd(config: KeywordLandingConfig) {
  const parent =
    config.type === "guide"
      ? null
      : config.type === "supply"
        ? null
        : { name: "Collection", url: absoluteUrl("/collection") };

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      ...(parent
        ? [{ "@type": "ListItem", position: 2, name: parent.name, item: parent.url }]
        : []),
      {
        "@type": "ListItem",
        position: parent ? 3 : 2,
        name: config.h1,
        item: absoluteUrl(config.canonicalPath),
      },
    ],
  };
}

export function keywordFaqJsonLd(config: KeywordLandingConfig) {
  if (config.faq.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: config.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function keywordItemListJsonLd(
  config: KeywordLandingConfig,
  products: ProductWithRelations[],
) {
  if (products.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: config.h1,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/collection/${product.slug}`),
      name: product.name,
    })),
  };
}

export function keywordGuideJsonLd(config: KeywordLandingConfig) {
  const type = config.type === "guide" ? "Article" : "WebPage";
  return {
    "@context": "https://schema.org",
    "@type": type,
    headline: config.h1,
    name: config.title,
    description: config.description,
    url: absoluteUrl(config.canonicalPath),
    publisher: {
      "@type": "Organization",
      name: "From The Trunk",
      logo: absoluteUrl("/Ftt_logo_navbar.avif"),
    },
  };
}
