import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { TrackPageView } from "@/components/analytics/track-page-view";
import {
  MobileFilterSheet,
  type CatalogFilterGroup,
  type CatalogFilterOption,
} from "@/components/catalog/mobile-filter-sheet";
import { FilterLink } from "@/components/collection/filter-link";

import { CollectionPageSizeSelect } from "@/components/product/collection-page-size-select";
import { ProductCard } from "@/components/product/product-card";
import { CollectionHeroCarousel } from "@/components/sections/collection-hero-carousel";
import { CollectionPromoCarousel } from "@/components/sections/collection-promo-carousel";
import {
  getCachedCatalogFacets,
  getCachedCollectionPage,
  getCachedSearchProducts,
  getCachedVisibleCollections,
} from "@/lib/data/catalog-cache";
import {
  DEFAULT_PRODUCT_SORT,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
  type ProductSortOption,
} from "@/lib/products/sort";
import type {
  CatalogFacets,
  CatalogSearchFilters,
} from "@/lib/ports/catalog-search";
import {
  colorSwatch,
  displayFacetLabel,
  normalizeColorSlug,
  normalizeFacetSlug,
} from "@/lib/catalog/filter-taxonomy";
import { hasCollectionFilterParams } from "@/lib/seo/collection-filter";
import { publicPageMetadata } from "@/lib/seo/metadata";
import type { Collection, Product } from "@/types/domain";
import type { CollectionPageContent } from "@/types/site-content";
import { cn } from "@/lib/utils";

export const revalidate = 60;

const COLLECTION_BANNER_IMAGES = [
  {
    src: "/banner/collection_banner-mobile.webp",
    alt: "From the Trunk collection banner",
  },
  {
    src: "/banner/collection-banner2-mobile.webp",
    alt: "From the Trunk collection banner alternate edit",
  },
] as const;
const DEFAULT_ITEMS_PER_PAGE = 10;
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50] as const;
const MAX_COLLECTION_PAGE = 10;
const MAX_VISIBLE_PRODUCTS = 100;

const shortSortLabels: Record<ProductSortOption, string> = {
  latest: "Newest",
  "price-low-to-high": "Low to High",
  "price-high-to-low": "High to Low",
};

const PRICE_RANGES = [
  { label: "Under ₹5k", min: undefined, max: 500000 },
  { label: "₹5k - ₹15k", min: 500000, max: 1500000 },
  { label: "₹15k - ₹50k", min: 1500000, max: 5000000 },
  { label: "₹50k+", min: 5000000, max: undefined },
] as const;

type CollectionSearchParams = {
  availability?: string;
  collection?: string | string[];
  color?: string | string[];
  colour?: string | string[];
  fabric?: string | string[];
  occasion?: string | string[];
  page?: string;
  pattern?: string | string[];
  perPage?: string | string[];
  priceMax?: string;
  priceMin?: string;
  sort?: string | string[];
  tags?: string | string[];
  type?: string | string[];
  work?: string | string[];
};

type CollectionPageProps = {
  searchParams?: Promise<CollectionSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: CollectionPageProps): Promise<Metadata> {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const hasFilters = hasCollectionFilterParams(resolvedSearchParams);

  return {
    ...publicPageMetadata({
      title: "Collection",
      description:
        "Discover curated, authenticated pre-loved luxury sarees from private wardrobes, couture archives, and collector trunks.",
      path: "/collection",
    }),
    robots: hasFilters
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

type BuildUrlPatch = {
  collectionSlug?: string | null;
  page?: number | null;
  sort?: ProductSortOption | null;
  types?: string[] | null;
  fabrics?: string[] | null;
  colors?: string[] | null;
  occasions?: string[] | null;
  works?: string[] | null;
  patterns?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: string | null;
  perPage?: number | null;
  tags?: string[] | null;
};

type FilterMetricEvent = {
  filterLabel: string;
  filterType: string;
  filterValue: string;
};

const firstStr = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const toArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toSlugArray = (
  value: string | string[] | undefined,
  options: { color?: boolean } = {},
) =>
  Array.from(
    new Set(
      toArray(value)
        .map((entry) =>
          options.color ? normalizeColorSlug(entry) : normalizeFacetSlug(entry),
        )
        .filter(Boolean),
    ),
  );

const safePage = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_COLLECTION_PAGE);
};

const parseOptionalInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseItemsPerPage = (
  value: string | string[] | undefined,
): (typeof ITEMS_PER_PAGE_OPTIONS)[number] => {
  const parsed = Number.parseInt(firstStr(value) ?? "", 10);
  return ITEMS_PER_PAGE_OPTIONS.includes(
    parsed as (typeof ITEMS_PER_PAGE_OPTIONS)[number],
  )
    ? (parsed as (typeof ITEMS_PER_PAGE_OPTIONS)[number])
    : DEFAULT_ITEMS_PER_PAGE;
};

const humanizeFilterValue = (value: string): string =>
  displayFacetLabel(value);

const formatRupeesFromPaise = (value: number): string =>
  `₹${Math.round(value / 100).toLocaleString("en-IN")}`;

const getPriceRangeLabel = (
  min: number | undefined,
  max: number | undefined,
): string => {
  const preset = PRICE_RANGES.find(
    (range) => range.min === min && range.max === max,
  );

  if (preset) return preset.label;
  if (typeof min === "number" && typeof max === "number") {
    return `${formatRupeesFromPaise(min)} - ${formatRupeesFromPaise(max)}`;
  }
  if (typeof min === "number") return `${formatRupeesFromPaise(min)}+`;
  if (typeof max === "number") return `Under ${formatRupeesFromPaise(max)}`;
  return "Price";
};

const buildPerfRequestId = (
  params: CollectionSearchParams | undefined,
) => {
  const entries = Object.entries(params ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (entries.length === 0) return "collection:index";

  const key = entries
    .map(([name, value]) =>
      Array.isArray(value)
        ? `${name}=${value.join("|")}`
        : `${name}=${value ?? ""}`,
    )
    .join("&");

  return `collection:${key}`;
};

export default async function CollectionPage({
  searchParams,
}: CollectionPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const perfRequestId =
    process.env.PERF_DEBUG === "1"
      ? buildPerfRequestId(resolvedSearchParams)
      : undefined;

  const requestedCollectionSlug = firstStr(resolvedSearchParams?.collection);
  const activeSort = parseProductSort(resolvedSearchParams?.sort);
  const currentPage = safePage(resolvedSearchParams?.page);
  const activeItemsPerPage = parseItemsPerPage(resolvedSearchParams?.perPage);
  const visibleLimit = Math.min(
    currentPage * activeItemsPerPage,
    MAX_VISIBLE_PRODUCTS,
  );

  const activeTypes = toSlugArray(resolvedSearchParams?.type);
  const activeFabrics = toSlugArray(resolvedSearchParams?.fabric);
  const activeColors = toSlugArray(
    resolvedSearchParams?.color ?? resolvedSearchParams?.colour,
    { color: true },
  );
  const activeOccasions = toSlugArray(resolvedSearchParams?.occasion);
  const activeWorks = toSlugArray(resolvedSearchParams?.work);
  const activePatterns = toSlugArray(resolvedSearchParams?.pattern);
  const activePriceMin = parseOptionalInt(resolvedSearchParams?.priceMin);
  const activePriceMax = parseOptionalInt(resolvedSearchParams?.priceMax);
  const requestedAvailability = firstStr(resolvedSearchParams?.availability);
  const activeAvailability =
    requestedAvailability === "true" || requestedAvailability === "available"
      ? "available"
      : undefined;
  const activeTags = toArray(resolvedSearchParams?.tags);

  const hasFilters =
    activeTypes.length > 0 ||
    activeFabrics.length > 0 ||
    activeColors.length > 0 ||
    activeOccasions.length > 0 ||
    activeWorks.length > 0 ||
    activePatterns.length > 0 ||
    typeof activePriceMin === "number" ||
    typeof activePriceMax === "number" ||
    !!activeAvailability ||
    activeTags.length > 0;

  const collectionPagePromise = getCachedCollectionPage(perfRequestId);
  const visibleCollectionsPromise =
    getCachedVisibleCollections(perfRequestId);

  const [collectionPage, visibleCollectionsResult] = await Promise.all([
    collectionPagePromise,
    visibleCollectionsPromise,
  ]);

  const cms = collectionPage as CollectionPageContent | null;
  const collections = (visibleCollectionsResult?.docs ?? []) as Collection[];
  let activeCollection = collections.find(
    (collection) => collection.slug === requestedCollectionSlug,
  );

  if (requestedCollectionSlug && !activeCollection) {
    const { getCollectionBySlug } = await import("@/db/queries/collections");
    const resolved = await getCollectionBySlug(requestedCollectionSlug);
    if (resolved) activeCollection = resolved as unknown as Collection;
  }

  const activeCollectionSlug = activeCollection?.slug;
  const cachedFacetsPromise = getCachedCatalogFacets({
    collectionSlug: activeCollectionSlug,
  }, perfRequestId);
  let items: Product[] = [];
  let totalDocs = 0;
  let facets: CatalogFacets = {
    fabric: {},
    color: {},
    occasion: {},
    work: {},
    pattern: {},
    type: {},
    availability: {},
    tags: {},
    tagDetails: {},
  };

  if (hasFilters) {
    const [result, cachedFacets] = await Promise.all([
      getCachedSearchProducts({
        collectionSlug: activeCollectionSlug,
        types: activeTypes.length > 0 ? activeTypes : undefined,
        fabrics: activeFabrics.length > 0 ? activeFabrics : undefined,
        colors: activeColors.length > 0 ? activeColors : undefined,
        occasions: activeOccasions.length > 0 ? activeOccasions : undefined,
        works: activeWorks.length > 0 ? activeWorks : undefined,
        patterns: activePatterns.length > 0 ? activePatterns : undefined,
        priceMin: activePriceMin,
        priceMax: activePriceMax,
        availabilityStatus: activeAvailability,
        tags: activeTags.length > 0 ? activeTags : undefined,
        limit: visibleLimit,
        sort: activeSort,
        includeFacets: false,
      }, perfRequestId),
      cachedFacetsPromise,
    ]);

    totalDocs = result.totalDocs;
    items = result.products as unknown as Product[];
    facets = cachedFacets;
  } else if (activeCollectionSlug) {
    const [result, cachedFacets] = await Promise.all([
      getCachedSearchProducts({
        collectionSlug: activeCollectionSlug,
        limit: visibleLimit,
        sort: activeSort,
        includeFacets: false,
      }, perfRequestId),
      cachedFacetsPromise,
    ]);

    items = result.products as unknown as Product[];
    totalDocs = result.totalDocs;
    facets = cachedFacets;
  } else {
    const [result, cachedFacets] = await Promise.all([
      getCachedSearchProducts({
        limit: visibleLimit,
        sort: activeSort,
        includeFacets: false,
      }, perfRequestId),
      cachedFacetsPromise,
    ]);

    items = result.products as unknown as Product[];
    totalDocs = result.totalDocs;
    facets = cachedFacets;
  }

  const hasMoreProducts =
    items.length < totalDocs && visibleLimit < MAX_VISIBLE_PRODUCTS;
  let suggestedItems: Product[] = [];
  let suggestionLabel = "Try one of these pieces instead.";

  const shouldFetchSuggestions =
    totalDocs === 0 && items.length === 0 && (hasFilters || !!activeCollectionSlug);

  if (shouldFetchSuggestions) {
    const suggestionLimit = 6;
    const suggestionBase: CatalogSearchFilters = {
      availabilityStatus: "available",
      collectionSlug: activeCollectionSlug,
      includeFacets: false,
      limit: suggestionLimit,
      sort: DEFAULT_PRODUCT_SORT,
    };
    const scopedTypes = activeTypes.length > 0 ? activeTypes : undefined;
    const suggestions: Array<{
      filters: CatalogSearchFilters;
      label: string;
    }> = [];
    const addSuggestion = (
      label: string,
      filters: Omit<CatalogSearchFilters, "includeFacets" | "limit" | "sort">,
    ) => {
      suggestions.push({
        filters: {
          ...suggestionBase,
          ...filters,
        },
        label,
      });
    };

    if (scopedTypes) {
      if (activeTypes.includes("blouse")) {
        if (activeColors.length > 0) {
          addSuggestion("Try one of these blouse options in a similar colour.", {
            colors: activeColors,
            types: scopedTypes,
          });
        }
        if (activeFabrics.length > 0) {
          addSuggestion("Try one of these blouse options in a similar fabric.", {
            fabrics: activeFabrics,
            types: scopedTypes,
          });
        }
      } else {
        if (activeFabrics.length > 0) {
          addSuggestion("Try one of these saree options in a similar fabric.", {
            fabrics: activeFabrics,
            types: scopedTypes,
          });
        }
        if (activeColors.length > 0) {
          addSuggestion("Try one of these saree options in a similar colour.", {
            colors: activeColors,
            types: scopedTypes,
          });
        }
      }

      if (activeOccasions.length > 0) {
        addSuggestion("Try pieces from the same occasion edit.", {
          occasions: activeOccasions,
          types: scopedTypes,
        });
      }
      addSuggestion("Try the newest available pieces in this category.", {
        types: scopedTypes,
      });
    } else {
      if (activeFabrics.length > 0) {
        addSuggestion("Try pieces in a similar fabric.", {
          fabrics: activeFabrics,
        });
      }
      if (activeColors.length > 0) {
        addSuggestion("Try pieces in a similar colour.", {
          colors: activeColors,
        });
      }
      if (activeOccasions.length > 0) {
        addSuggestion("Try pieces from the same occasion edit.", {
          occasions: activeOccasions,
        });
      }
      addSuggestion("Try the newest available pieces from the trunk.", {});
    }

    for (const suggestion of suggestions) {
      const result = await getCachedSearchProducts(
        suggestion.filters,
        perfRequestId,
      );
      if (result.products.length > 0) {
        suggestedItems = result.products as unknown as Product[];
        suggestionLabel = suggestion.label;
        break;
      }
    }
  }

  const collectionCount = collections.length;
  const activeCollectionLabel = activeCollection?.name ?? "All pieces";
  const filterDescription =
    activeCollection?.description ??
    cms?.filtersBody ??
    "Choose an edit, then refine by category, fabric, colour, price, occasion, work, and availability.";
  const buildUrl = (patch: BuildUrlPatch = {}) => {
    const nextCollectionSlug =
      "collectionSlug" in patch
        ? (patch.collectionSlug ?? undefined)
        : activeCollectionSlug;
    const nextSort =
      "sort" in patch ? (patch.sort ?? DEFAULT_PRODUCT_SORT) : activeSort;
    const nextPage = "page" in patch ? (patch.page ?? 1) : currentPage;
    const nextTypes = "types" in patch ? (patch.types ?? []) : activeTypes;
    const nextFabrics =
      "fabrics" in patch ? (patch.fabrics ?? []) : activeFabrics;
    const nextColors = "colors" in patch ? (patch.colors ?? []) : activeColors;
    const nextOccasions =
      "occasions" in patch ? (patch.occasions ?? []) : activeOccasions;
    const nextWorks = "works" in patch ? (patch.works ?? []) : activeWorks;
    const nextPatterns =
      "patterns" in patch ? (patch.patterns ?? []) : activePatterns;
    const nextPriceMin =
      "priceMin" in patch
        ? (patch.priceMin ?? undefined)
        : activePriceMin;
    const nextPriceMax =
      "priceMax" in patch
        ? (patch.priceMax ?? undefined)
        : activePriceMax;
    const nextAvailability =
      "availability" in patch
        ? (patch.availability ?? undefined)
        : activeAvailability;
    const nextItemsPerPage =
      "perPage" in patch
        ? (patch.perPage ?? DEFAULT_ITEMS_PER_PAGE)
        : activeItemsPerPage;
    const nextTags = "tags" in patch ? (patch.tags ?? []) : activeTags;

    const params = new URLSearchParams();
    if (nextCollectionSlug) params.set("collection", nextCollectionSlug);
    if (nextSort !== DEFAULT_PRODUCT_SORT) params.set("sort", nextSort);
    if (nextPage && nextPage > 1) params.set("page", String(nextPage));
    for (const type of nextTypes) params.append("type", type);
    for (const fabric of nextFabrics) params.append("fabric", fabric);
    for (const color of nextColors) params.append("color", color);
    for (const occasion of nextOccasions) params.append("occasion", occasion);
    for (const work of nextWorks) params.append("work", work);
    for (const pattern of nextPatterns) params.append("pattern", pattern);
    if (typeof nextPriceMin === "number") {
      params.set("priceMin", String(nextPriceMin));
    }
    if (typeof nextPriceMax === "number") {
      params.set("priceMax", String(nextPriceMax));
    }
    if (nextAvailability) params.set("availability", nextAvailability);
    if (nextItemsPerPage !== DEFAULT_ITEMS_PER_PAGE) {
      params.set("perPage", String(nextItemsPerPage));
    }
    for (const tag of nextTags) params.append("tags", tag);

    const qs = params.toString();
    return `/collection${qs ? `?${qs}` : ""}`;
  };
  const toggleValue = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((entry) => entry !== value)
      : [...values, value];

  const hasAnyFilter =
    !!activeCollectionSlug || hasFilters || activeSort !== DEFAULT_PRODUCT_SORT;
  const toOptions = (
    facet: Record<string, number>,
    options: { color?: boolean } = {},
  ): CatalogFilterOption[] =>
    Object.entries(facet)
      .filter(([key, count]) => key && count > 0)
      .sort((a, b) => b[1] - a[1] || displayFacetLabel(a[0]).localeCompare(displayFacetLabel(b[0])))
      .map(([value, count]) => ({
        count,
        label: displayFacetLabel(value),
        swatch: options.color ? colorSwatch(value) : undefined,
        value,
      }));

  const fabricOptions = toOptions(facets.fabric);
  const typeOptions = toOptions(facets.type);
  const colorOptions = toOptions(facets.color, { color: true });
  const occasionOptions = toOptions(facets.occasion);
  const workOptions = toOptions(facets.work);
  const patternOptions = toOptions(facets.pattern);
  const availableCount = facets.availability.available ?? 0;
  const activePriceValue =
    typeof activePriceMin === "number" || typeof activePriceMax === "number"
      ? `${activePriceMin ?? ""}:${activePriceMax ?? ""}`
      : "";
  const priceOptions: CatalogFilterOption[] = PRICE_RANGES.map((range) => ({
    label: range.label,
    value: `${range.min ?? ""}:${range.max ?? ""}`,
  }));
  const availabilityOptions: CatalogFilterOption[] = [
    {
      count: availableCount > 0 ? availableCount : undefined,
      label: "In stock",
      value: "available",
    },
  ];
  const sortOptions: CatalogFilterOption[] = PRODUCT_SORT_OPTIONS.map((option) => ({
    label: shortSortLabels[option.value],
    value: option.value,
  }));
  const collectionOptions: CatalogFilterOption[] = collections.map((collection) => ({
    count: undefined,
    label: collection.name,
    value: collection.slug,
  }));
  const keepFacetGroup = (options: CatalogFilterOption[]) => options.length >= 2;
  const filterGroups: CatalogFilterGroup[] = [
    collectionOptions.length > 0
      ? {
          key: "collection",
          options: collectionOptions,
          param: "collection",
          selected: activeCollectionSlug ? [activeCollectionSlug] : [],
          selection: "single",
          title: "Edit",
        }
      : null,
    keepFacetGroup(typeOptions)
      ? {
          key: "type",
          options: typeOptions,
          param: "type",
          selected: activeTypes,
          selection: "multi",
          title: "Category",
        }
      : null,
    keepFacetGroup(fabricOptions)
      ? {
          key: "fabric",
          options: fabricOptions,
          param: "fabric",
          selected: activeFabrics,
          selection: "multi",
          title: "Fabric",
        }
      : null,
    keepFacetGroup(colorOptions)
      ? {
          key: "color",
          options: colorOptions,
          param: "color",
          selected: activeColors,
          selection: "multi",
          title: "Colour",
        }
      : null,
    {
      key: "price",
      options: priceOptions,
      param: "price",
      selected: activePriceValue ? [activePriceValue] : [],
      selection: "single",
      title: "Price",
    },
    {
      key: "availability",
      options: availabilityOptions,
      param: "availability",
      selected: activeAvailability ? [activeAvailability] : [],
      selection: "single",
      title: "Availability",
    },
    keepFacetGroup(occasionOptions)
      ? {
          key: "occasion",
          options: occasionOptions,
          param: "occasion",
          selected: activeOccasions,
          selection: "multi",
          title: "Occasion",
        }
      : null,
    keepFacetGroup(workOptions)
      ? {
          key: "work",
          options: workOptions,
          param: "work",
          selected: activeWorks,
          selection: "multi",
          title: "Work / Border",
        }
      : null,
    keepFacetGroup(patternOptions)
      ? {
          key: "pattern",
          options: patternOptions,
          param: "pattern",
          selected: activePatterns,
          selection: "multi",
          title: "Pattern / Motif",
        }
      : null,
    {
      key: "sort",
      options: sortOptions,
      param: "sort",
      selected: [activeSort],
      selection: "single",
      title: "Sort",
    },
  ].filter((group): group is CatalogFilterGroup => Boolean(group));
  const appliedFilters: Array<{ label: string; href: string; kind?: string }> =
    [];

  if (activeCollectionSlug) {
    appliedFilters.push({
      label: activeCollectionLabel,
      href: buildUrl({ collectionSlug: null, page: 1 }),
      kind: "collection",
    });
  }

  for (const type of activeTypes) {
    appliedFilters.push({
      label: humanizeFilterValue(type),
      href: buildUrl({ types: activeTypes.filter((entry) => entry !== type), page: 1 }),
      kind: "type",
    });
  }

  for (const fabric of activeFabrics) {
    appliedFilters.push({
      label: humanizeFilterValue(fabric),
      href: buildUrl({
        fabrics: activeFabrics.filter((entry) => entry !== fabric),
        page: 1,
      }),
      kind: "fabric",
    });
  }

  for (const color of activeColors) {
    appliedFilters.push({
      label: humanizeFilterValue(color),
      href: buildUrl({
        colors: activeColors.filter((entry) => entry !== color),
        page: 1,
      }),
      kind: "color",
    });
  }

  for (const occasion of activeOccasions) {
    appliedFilters.push({
      label: humanizeFilterValue(occasion),
      href: buildUrl({
        occasions: activeOccasions.filter((entry) => entry !== occasion),
        page: 1,
      }),
      kind: "occasion",
    });
  }

  for (const work of activeWorks) {
    appliedFilters.push({
      label: humanizeFilterValue(work),
      href: buildUrl({
        works: activeWorks.filter((entry) => entry !== work),
        page: 1,
      }),
      kind: "work",
    });
  }

  for (const pattern of activePatterns) {
    appliedFilters.push({
      label: humanizeFilterValue(pattern),
      href: buildUrl({
        patterns: activePatterns.filter((entry) => entry !== pattern),
        page: 1,
      }),
      kind: "pattern",
    });
  }

  if (
    typeof activePriceMin === "number" ||
    typeof activePriceMax === "number"
  ) {
    appliedFilters.push({
      label: getPriceRangeLabel(activePriceMin, activePriceMax),
      href: buildUrl({ priceMin: null, priceMax: null, page: 1 }),
      kind: "price",
    });
  }

  if (activeAvailability) {
    appliedFilters.push({
      label: "In stock",
      href: buildUrl({ availability: null, page: 1 }),
      kind: "availability",
    });
  }

  for (const tag of activeTags) {
    const details = facets.tagDetails[tag];
    appliedFilters.push({
      label: details?.name ?? humanizeFilterValue(tag),
      href: buildUrl({
        tags: activeTags.filter((activeTag) => activeTag !== tag),
        page: 1,
      }),
      kind: "tag",
    });
  }

  if (activeSort !== DEFAULT_PRODUCT_SORT) {
    appliedFilters.push({
      label: `Sort: ${shortSortLabels[activeSort]}`,
      href: buildUrl({ sort: DEFAULT_PRODUCT_SORT, page: 1 }),
      kind: "sort",
    });
  }

  const appliedFilterEvents: FilterMetricEvent[] = [
    activeCollectionSlug
      ? {
          filterLabel: activeCollectionLabel,
          filterType: "collection",
          filterValue: activeCollectionSlug,
        }
      : null,
    ...activeTypes.map((type) => ({
      filterLabel: humanizeFilterValue(type),
      filterType: "type",
      filterValue: type,
    })),
    ...activeFabrics.map((fabric) => ({
      filterLabel: humanizeFilterValue(fabric),
      filterType: "fabric",
      filterValue: fabric,
    })),
    ...activeColors.map((color) => ({
      filterLabel: humanizeFilterValue(color),
      filterType: "color",
      filterValue: color,
    })),
    ...activeOccasions.map((occasion) => ({
      filterLabel: humanizeFilterValue(occasion),
      filterType: "occasion",
      filterValue: occasion,
    })),
    ...activeWorks.map((work) => ({
      filterLabel: humanizeFilterValue(work),
      filterType: "work",
      filterValue: work,
    })),
    ...activePatterns.map((pattern) => ({
      filterLabel: humanizeFilterValue(pattern),
      filterType: "pattern",
      filterValue: pattern,
    })),
    typeof activePriceMin === "number" || typeof activePriceMax === "number"
      ? {
          filterLabel: getPriceRangeLabel(activePriceMin, activePriceMax),
          filterType: "price_range",
          filterValue: `${activePriceMin ?? "min"}-${activePriceMax ?? "max"}`,
        }
      : null,
    activeAvailability
      ? {
          filterLabel: "In stock",
          filterType: "availability",
          filterValue: "available",
        }
      : null,
    ...activeTags.map((tag) => {
      const details = facets.tagDetails[tag];
      return {
        filterLabel: details?.name ?? humanizeFilterValue(tag),
        filterType: "tag",
        filterValue: tag,
      };
    }),
    activeSort !== DEFAULT_PRODUCT_SORT
      ? {
          filterLabel: shortSortLabels[activeSort],
          filterType: "sort",
          filterValue: activeSort,
        }
      : null,
  ].filter((event): event is FilterMetricEvent => Boolean(event));

  const appliedFilterCount = appliedFilters.filter(
    (filter) => filter.kind !== "sort",
  ).length;

  const selectedForGroup = (group: CatalogFilterGroup, optionValue: string) => {
    if (group.selection === "single") {
      return group.selected.includes(optionValue) ? [] : [optionValue];
    }

    return toggleValue(group.selected, optionValue);
  };

  const parsePriceOption = (value: string) => {
    const [min, max] = value.split(":");
    return {
      max: max ? Number(max) : null,
      min: min ? Number(min) : null,
    };
  };

  const buildFilterOptionHref = (
    group: CatalogFilterGroup,
    option: CatalogFilterOption,
  ) => {
    const nextSelected = selectedForGroup(group, option.value);

    switch (group.param) {
      case "collection":
        return buildUrl({ collectionSlug: nextSelected[0] ?? null, page: 1 });
      case "type":
        return buildUrl({ page: 1, types: nextSelected });
      case "fabric":
        return buildUrl({ fabrics: nextSelected, page: 1 });
      case "color":
        return buildUrl({ colors: nextSelected, page: 1 });
      case "occasion":
        return buildUrl({ occasions: nextSelected, page: 1 });
      case "work":
        return buildUrl({ page: 1, works: nextSelected });
      case "pattern":
        return buildUrl({ page: 1, patterns: nextSelected });
      case "price": {
        const isActive = group.selected.includes(option.value);
        const range = parsePriceOption(option.value);
        return buildUrl({
          page: 1,
          priceMax: isActive ? null : range.max,
          priceMin: isActive ? null : range.min,
        });
      }
      case "availability":
        return buildUrl({
          availability: nextSelected[0] ?? null,
          page: 1,
        });
      case "sort":
        return buildUrl({
          page: 1,
          sort: (nextSelected[0] as ProductSortOption | undefined) ?? DEFAULT_PRODUCT_SORT,
        });
    }
  };

  const renderFilterPanel = () => (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#74531B]">
            Refine the trunk
          </p>
          <h2 className="mt-1 font-serif text-2xl leading-none text-[var(--ftt-royal-navy)]">
            Filters
          </h2>
        </div>

        {hasAnyFilter ? (
          <FilterLink
            href="/collection"
            className="rounded-full border border-[var(--ftt-border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--ftt-burgundy)] transition hover:border-[var(--ftt-burgundy)]/40 hover:bg-[var(--ftt-burgundy)]/5"
          >
            Reset
          </FilterLink>
        ) : null}
      </div>

      <p className="text-sm leading-6 text-[var(--ftt-muted)]">
        {filterDescription}
      </p>

      {filterGroups.map((group) => {
        const selectedCount =
          group.param === "sort" ? 0 : group.selected.length;

        return (
          <FilterSection
            key={group.key}
            id={`filter-${group.key}`}
            selectedCount={selectedCount}
            title={group.title}
          >
            {group.param === "collection" ? (
              <FilterPill
                href={buildUrl({ collectionSlug: null, page: 1 })}
                active={!activeCollectionSlug}
              >
                All pieces
              </FilterPill>
            ) : null}

            {group.options.map((option) => (
              <FilterPill
                key={option.value}
                href={buildFilterOptionHref(group, option)}
                active={group.selected.includes(option.value)}
                count={option.count}
                swatch={option.swatch}
              >
                {option.label}
              </FilterPill>
            ))}
          </FilterSection>
        );
      })}
    </div>
  );

  const renderProduct = (product: Product) => (
    <ProductCard key={product.id} product={product} />
  );

  return (
    <main className="min-h-screen bg-[#FDF7F1] text-[#0E0D0E]">
      <TrackPageView
        eventKey={`collection_view:${activeCollectionSlug ?? "all"}:${currentPage}:${activeSort}:${activeTypes.join(",") || "all"}:${activeFabrics.join(",") || "all"}:${activeColors.join(",") || "all"}:${activeOccasions.join(",") || "all"}:${activePriceMin ?? "min-any"}:${activePriceMax ?? "max-any"}:${activeAvailability ?? "any"}:${activeTags.slice().sort().join(",")}`}
        type="collection_view"
        payload={{
          collectionSlug: activeCollectionSlug ?? null,
          filters: {
            availability: activeAvailability,
            colors: activeColors,
            fabrics: activeFabrics,
            occasions: activeOccasions,
            patterns: activePatterns,
            priceMax: activePriceMax ?? null,
            priceMin: activePriceMin ?? null,
            tags: activeTags,
            types: activeTypes,
            works: activeWorks,
          },
          page: currentPage,
          resultCount: items.length,
          sort: activeSort,
          source: "collection_page",
          totalDocs,
        }}
      />
      {appliedFilterEvents.map((filter) => (
        <TrackPageView
          key={`filter_applied:${filter.filterType}:${filter.filterValue}`}
          eventKey={`filter_applied:${filter.filterType}:${filter.filterValue}`}
          type="filter_applied"
          payload={{
            collectionSlug: activeCollectionSlug ?? null,
            filterLabel: filter.filterLabel,
            filterType: filter.filterType,
            filterValue: filter.filterValue,
            page: currentPage,
            resultCount: items.length,
            sort: activeSort,
            source: "collection_page",
            totalDocs,
          }}
        />
      ))}
      <div className="mx-auto w-full max-w-[1720px] space-y-4 px-3 py-3 sm:px-5 md:px-6 lg:px-8 lg:py-6">
        <section className="overflow-hidden rounded-[1.5rem] border border-[#E7DDD4] bg-[#141D46] shadow-[0_18px_50px_rgba(20,29,70,0.13)] md:grid md:min-h-[340px] md:grid-cols-[0.48fr_0.52fr] lg:min-h-[460px] lg:grid-cols-[0.46fr_0.54fr] lg:rounded-[1.75rem] xl:min-h-[500px]">
          <div
            className="relative isolate min-h-[340px] overflow-hidden bg-[#141D46] p-5 text-[#FDF7F1] sm:min-h-[360px] sm:p-6 md:min-h-[340px] md:p-7 lg:min-h-[460px] lg:p-10 xl:min-h-[500px]"
            // style={{
            //   background:
            //     "linear-gradient(135deg, #141D46 0%, #10183B 58%, #601D1C 145%)",
            // }}
          >
            <div className="relative flex min-h-[298px] flex-col justify-between gap-6 sm:min-h-[312px] md:min-h-[286px] lg:min-h-[380px] lg:gap-8 xl:min-h-[420px]">
              <div className="max-w-xl space-y-4 lg:space-y-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.42em] text-[var(--ftt-gold)]">
                  {cms?.eyebrow ?? "The Collection"}
                </p>

                <h1 className="max-w-[12ch] text-balance font-serif text-4xl font-medium leading-[0.98] text-[#FDF7F1] sm:text-5xl lg:text-6xl lg:leading-[0.96]">
                  {cms?.title ?? "Curated pre-loved sarees"}
                </h1>

                <p className="max-w-md text-pretty text-sm leading-6 text-[#FDF7F1]/78 sm:text-base lg:leading-7">
                  {cms?.description ??
                    "Discover heirlooms from private wardrobes, couture archives, and collector trunks. Each piece is authenticated and accompanied by its story."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <HeroStat label="Live pieces" value={String(totalDocs)} />
                <HeroStat label="Edits" value={String(collectionCount)} />
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ftt-ivory)]/60">
                    Promise
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--ftt-ivory)]">
                    Authenticated, graded, re-storied
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative min-h-[300px] overflow-hidden bg-[#141D46] sm:min-h-[340px] md:min-h-[340px] lg:min-h-[460px] xl:min-h-[500px]">
            <Image
              src={COLLECTION_BANNER_IMAGES[0].src}
              alt={COLLECTION_BANNER_IMAGES[0].alt}
              fill
              priority
              fetchPriority="high"
              sizes="(max-width: 1024px) 100vw, 52vw"
              className="object-contain object-top"
            />
            <CollectionHeroCarousel
              images={COLLECTION_BANNER_IMAGES}
              prioritizeFirst={false}
            />
          </div>
        </section>

        {/* <section aria-label="Collection edits">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <CollectionRailCard
              href={buildUrl({ collectionSlug: null, page: 1 })}
              active={!activeCollectionSlug}
              eyebrow="Full trunk"
              title="All pieces"
              description="Browse every authenticated saree currently available."
            />

            {collections.map((collection, index) => (
              <CollectionRailCard
                key={collection.id}
                href={buildUrl({
                  collectionSlug: collection.slug,
                  page: 1,
                })}
                active={activeCollectionSlug === collection.slug}
                eyebrow={`Edit ${String(index + 1).padStart(2, "0")}`}
                title={collection.name}
                description={
                  collection.description ??
                  "A private curation from the trunk."
                }
              />
            ))}
          </div>
        </section> */}

        <section className="sticky top-[6.75rem] z-30 rounded-[1.35rem] border border-[var(--ftt-border)] bg-[var(--ftt-card)]/94 p-3 shadow-[0_12px_35px_rgba(20,29,70,0.10)] backdrop-blur-xl lg:rounded-[1.5rem]">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <MobileFilterSheet
                activeCount={appliedFilterCount}
                groups={filterGroups}
                perPage={
                  activeItemsPerPage === DEFAULT_ITEMS_PER_PAGE
                    ? undefined
                    : activeItemsPerPage
                }
              />

              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-[#74531B]">
                  Showing
                </p>
                <p className="text-sm font-medium text-[var(--ftt-royal-navy)]">
                  {items.length} of {totalDocs} pieces
                </p>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden lg:px-2">
              <div className="flex max-w-full gap-2 overflow-x-auto pb-0.5">
              {appliedFilters.length > 0 ? (
                appliedFilters.map((filter) => (
                  <FilterLink
                    key={`${filter.kind}-${filter.label}`}
                    aria-label={`Remove ${filter.label} filter`}
                    href={filter.href}
                    className="inline-flex h-9 max-w-full shrink-0 items-center rounded-full border border-[var(--ftt-gold)]/40 bg-[var(--ftt-gold)]/10 px-3 text-xs font-medium text-[var(--ftt-royal-navy)] transition hover:bg-[var(--ftt-gold)]/18"
                  >
                    <span className="max-w-[14rem] truncate">{filter.label}</span>
                    <span className="ml-2 text-[var(--ftt-burgundy)]">x</span>
                  </FilterLink>
                ))
              ) : (
                <span className="inline-flex h-9 max-w-full items-center rounded-full border border-[var(--ftt-border)] bg-white/60 px-3 text-xs leading-tight text-[var(--ftt-muted)]">
                  No filters applied
                </span>
              )}
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
              {hasAnyFilter ? (
                <FilterLink
                  href="/collection"
                  className="inline-flex h-10 shrink-0 items-center rounded-full border border-[#601D1C]/30 bg-[#601D1C]/8 px-4 text-xs font-semibold text-[#601D1C] transition hover:bg-[#601D1C] hover:text-[#FDF7F1]"
                >
                  Clear all
                </FilterLink>
              ) : null}

              <CollectionPageSizeSelect
                defaultValue={DEFAULT_ITEMS_PER_PAGE}
                options={ITEMS_PER_PAGE_OPTIONS}
                value={activeItemsPerPage}
              />
            </div>
          </div>
        </section>

        <section
          id="collection-grid"
          className="grid gap-6 lg:min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start"
        >
          <aside className="hidden rounded-[1.5rem] border border-[var(--ftt-border)] bg-[var(--ftt-card)] p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] lg:sticky lg:top-[11.75rem] lg:block lg:max-h-[calc(100vh-12.5rem)] lg:overflow-y-auto">
            {renderFilterPanel()}
          </aside>

          <div className="space-y-6 lg:pr-2">
            <div className="flex flex-col gap-3 border-b border-[var(--ftt-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-[#74531B]">
                  Current edit
                </p>
                <h2 className="mt-1 font-serif text-3xl text-[var(--ftt-royal-navy)]">
                  {activeCollectionLabel}
                </h2>
              </div>

              <p className="max-w-md text-sm leading-6 text-[var(--ftt-muted)]">
                {items.length} visible now, {totalDocs} total in this view.
              </p>
            </div>

            {items.length === 0 ? (
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-dashed border-[var(--ftt-gold)]/50 bg-[var(--ftt-card)] p-8 text-center shadow-sm">
                  <p className="font-serif text-3xl text-[var(--ftt-royal-navy)]">
                    {hasFilters
                      ? "No exact matches found."
                      : "The next curated drop is being prepared"}
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ftt-muted)]">
                    {hasFilters
                      ? "Your exact filter combination is not available right now. The recommendations below are nearby options, not exact matches."
                      : "Our team is authenticating fresh heirloom pieces right now. Reset the filters or return shortly for the next trunk edit."}
                  </p>

                  <FilterLink
                    href="/collection"
                    className="mt-6 inline-flex rounded-full bg-[var(--ftt-royal-navy)] px-6 py-3 text-sm font-medium text-[var(--ftt-ivory)] transition hover:bg-[var(--ftt-midnight)]"
                  >
                    Reset filters
                  </FilterLink>
                </div>

                {suggestedItems.length > 0 ? (
                  <section
                    aria-labelledby="collection-suggestions-title"
                    className="space-y-4"
                  >
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-[#74531B]">
                        Suggested pieces
                      </p>
                      <h3
                        id="collection-suggestions-title"
                        className="mt-1 font-serif text-3xl text-[var(--ftt-royal-navy)]"
                      >
                        {suggestionLabel}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 items-stretch gap-x-4 gap-y-5 min-[520px]:grid-cols-2 md:grid-cols-3 md:gap-y-6 xl:grid-cols-4 [&>*]:min-w-0">
                      {suggestedItems.map(renderProduct)}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 items-stretch gap-x-4 gap-y-5 min-[520px]:grid-cols-2 md:grid-cols-3 md:gap-y-6 xl:grid-cols-4 [&>*]:min-w-0">
                  {items.slice(0, 3).map(renderProduct)}
                  {items.length > 4 ? (
                    <CollectionPromoCarousel className="hidden md:flex xl:hidden" />
                  ) : null}
                  {items.slice(3, 4).map(renderProduct)}
                  {items.length > 4 ? (
                    <CollectionPromoCarousel className="md:hidden xl:flex" />
                  ) : null}
                  {items.slice(4).map(renderProduct)}
                </div>

                {hasMoreProducts ? (
                  <div className="flex justify-center pt-2">
                    <Link
                      href={buildUrl({ page: currentPage + 1 })}
                      prefetch={false}
                      scroll={false}
                      className="rounded-full bg-[var(--ftt-royal-navy)] px-8 py-3 text-sm font-semibold text-[var(--ftt-ivory)] shadow-[0_14px_34px_rgba(20,29,70,0.18)] transition hover:bg-[var(--ftt-midnight)]"
                    >
                      Load more
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--ftt-ivory)]/60">
        {label}
      </p>
      <p className="mt-2 font-serif text-4xl text-[var(--ftt-ivory)]">
        {value}
      </p>
    </div>
  );
}

function CollectionRailCard({
  href,
  active,
  eyebrow,
  title,
  description,
}: {
  href: string;
  active: boolean;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "min-w-56 rounded-[1.15rem] border bg-[var(--ftt-card)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(20,29,70,0.10)]",
        active
          ? "border-[var(--ftt-gold)] ring-1 ring-[var(--ftt-gold)]/25"
          : "border-[var(--ftt-border)]",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#74531B]">
        {eyebrow}
      </p>
      <h3 className="mt-5 line-clamp-2 font-serif text-2xl leading-none text-[var(--ftt-royal-navy)]">
        {title}
      </h3>
      <p className="mt-3 line-clamp-2 text-sm leading-5 text-[var(--ftt-muted)]">
        {description}
      </p>
    </Link>
  );
}

function FilterSection({
  id,
  selectedCount = 0,
  title,
  children,
}: {
  id?: string;
  selectedCount?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={selectedCount > 0}
      className="scroll-mt-28 rounded-[1.1rem] border border-[var(--ftt-border)] bg-[#FDF7F1]/65 shadow-sm"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--ftt-muted)]">
          {title}
        </span>
        {selectedCount > 0 ? (
          <span
            aria-label={`${selectedCount} selected`}
            className="rounded-full bg-[var(--ftt-gold)] px-2 py-0.5 text-xs font-semibold text-[var(--ftt-royal-navy)]"
          >
            {selectedCount}
          </span>
        ) : null}
      </summary>
      <div className="grid gap-2 border-t border-[var(--ftt-border)]/70 p-3">
        {children}
      </div>
    </details>
  );
}

function FilterPill({
  href,
  active,
  children,
  className,
  count,
  swatch,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
  count?: number;
  swatch?: string;
}) {
  return (
    <FilterLink
      href={href}
      className={cn(
        "group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.14em] transition",
        active
          ? "border-[var(--ftt-royal-navy)] bg-[var(--ftt-royal-navy)]/7 text-[var(--ftt-royal-navy)] shadow-sm"
          : "border-[var(--ftt-border)] bg-[#FDF7F1]/70 text-[var(--ftt-muted)] hover:border-[var(--ftt-gold)]/60 hover:text-[var(--ftt-royal-navy)]",
        className,
      )}
    >
      <span
        className={cn(
          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition",
          active
            ? "border-[var(--ftt-royal-navy)] bg-[var(--ftt-royal-navy)]"
            : "border-[var(--ftt-border)] bg-[#FDF7F1] group-hover:border-[var(--ftt-gold)]/70",
        )}
      >
        {active ? (
          <span className="h-1.5 w-1.5 rounded-[2px] bg-[var(--ftt-gold)]" />
        ) : null}
      </span>
      {swatch ? (
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-[var(--ftt-border)]"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1">{children}</span>
      {typeof count === "number" ? (
        <span className="text-[var(--ftt-muted)]/75">({count})</span>
      ) : null}
    </FilterLink>
  );
}
