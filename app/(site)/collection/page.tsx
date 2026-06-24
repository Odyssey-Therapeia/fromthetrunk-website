import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { FilterLink } from "@/components/collection/filter-link";
import { MobileFilterDisclosure } from "@/components/collection/mobile-filter-disclosure";
import { draftMode } from "next/headers";

import { CollectionPageSizeSelect } from "@/components/product/collection-page-size-select";
import { ProductCard } from "@/components/product/product-card";
import { CollectionHeroCarousel } from "@/components/sections/collection-hero-carousel";
import { CollectionPromoCarousel } from "@/components/sections/collection-promo-carousel";
import { getCollections, getGlobals } from "@/lib/data/products";
import {
  DEFAULT_PRODUCT_SORT,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
  type ProductSortOption,
} from "@/lib/products/sort";
import type { CatalogFacets } from "@/lib/ports/catalog-search";
import { searchProducts } from "@/lib/ports/catalog-search";
import type { Collection, Product } from "@/types/domain";
import type { CollectionPageContent } from "@/types/site-content";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection",
  description:
    "Discover curated, authenticated pre-loved luxury sarees from private wardrobes, couture archives, and collector trunks.",
};

const COLLECTION_BANNER_IMAGES = [
  {
    src: "/banner/collection_banner.png",
    alt: "From the Trunk collection banner",
  },
  {
    src: "/banner/collection-banner2.png",
    alt: "From the Trunk collection banner alternate edit",
  },
] as const;
const DEFAULT_ITEMS_PER_PAGE = 10;
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50] as const;

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

const TAG_FILTER_GROUPS = [
  {
    key: "occasion",
    title: "Occasion",
    aliases: ["occasion", "occasions", "event", "events"],
    keywords: [
      "bridal",
      "wedding",
      "festive",
      "party",
      "cocktail",
      "reception",
      "engagement",
      "mehendi",
      "sangeet",
      "temple",
      "gala",
      "daily",
      "office",
    ],
  },
  {
    key: "saree-style",
    title: "Saree style / weave",
    aliases: [
      "saree-style",
      "saree style",
      "style",
      "weave",
      "weaving",
      "craft",
      "region",
    ],
    keywords: [
      "banarasi",
      "kanjeevaram",
      "kanjivaram",
      "chanderi",
      "patola",
      "paithani",
      "tussar",
      "kota",
      "organza",
      "linen",
      "handloom",
      "printed",
    ],
  },
  {
    key: "work-border",
    title: "Work / border",
    aliases: [
      "work",
      "border",
      "embellishment",
      "embroidery",
      "craftwork",
      "finish",
    ],
    keywords: [
      "zari",
      "zardozi",
      "gota",
      "sequins",
      "embroidered",
      "embroidery",
      "thread",
      "mirror",
      "lace",
      "border",
      "temple border",
    ],
  },
  {
    key: "pattern",
    title: "Pattern / motif",
    aliases: ["pattern", "patterns", "motif", "motifs", "print", "prints"],
    keywords: [
      "floral",
      "geometric",
      "paisley",
      "butti",
      "stripes",
      "checks",
      "solid",
      "plain",
      "abstract",
      "animal",
    ],
  },
  {
    key: "color",
    title: "Colour",
    aliases: ["color", "colour", "colors", "colours", "shade", "shades"],
    keywords: [
      "red",
      "maroon",
      "burgundy",
      "ivory",
      "white",
      "black",
      "gold",
      "green",
      "blue",
      "navy",
      "pink",
      "purple",
      "yellow",
      "orange",
      "grey",
      "gray",
      "beige",
      "cream",
    ],
  },
] as const;

type CollectionPageProps = {
  searchParams:
    | Promise<{
        collection?: string | string[];
        page?: string;
        sort?: string | string[];
        type?: string | string[];
        fabric?: string | string[];
        priceMin?: string;
        priceMax?: string;
        availability?: string;
        perPage?: string | string[];
        tags?: string | string[];
      }>
    | {
        collection?: string | string[];
        page?: string;
        sort?: string | string[];
        type?: string | string[];
        fabric?: string | string[];
        priceMin?: string;
        priceMax?: string;
        availability?: string;
        perPage?: string | string[];
        tags?: string | string[];
      };
};

type BuildUrlPatch = {
  collectionSlug?: string | null;
  page?: number | null;
  sort?: ProductSortOption | null;
  type?: string | null;
  fabric?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: boolean | null;
  perPage?: number | null;
  tags?: string[] | null;
};

const firstStr = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const toArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const safePage = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeFilterKey = (value: string): string =>
  value.toLowerCase().replace(/[_\s]+/g, "-").trim();

type TagFilterOption = {
  category: string;
  count: number;
  label: string;
  slug: string;
};

const tagOptionMatchesGroup = (
  option: TagFilterOption,
  group: (typeof TAG_FILTER_GROUPS)[number],
) => {
  const category = normalizeFilterKey(option.category);
  if (group.aliases.some((alias) => normalizeFilterKey(alias) === category)) {
    return true;
  }

  const searchable = normalizeFilterKey(`${option.slug} ${option.label}`);
  return group.keywords.some((keyword) =>
    searchable.includes(normalizeFilterKey(keyword)),
  );
};

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

export default async function CollectionPage({
  searchParams,
}: CollectionPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const resolvedSearchParams = await Promise.resolve(searchParams);

  const requestedCollectionSlug = firstStr(resolvedSearchParams?.collection);
  const activeSort = parseProductSort(resolvedSearchParams?.sort);
  const currentPage = safePage(resolvedSearchParams?.page);
  const activeItemsPerPage = parseItemsPerPage(resolvedSearchParams?.perPage);
  const visibleLimit = currentPage * activeItemsPerPage;

  const activeType = firstStr(resolvedSearchParams?.type);
  const activeFabric = firstStr(resolvedSearchParams?.fabric);
  const activePriceMin = parseOptionalInt(resolvedSearchParams?.priceMin);
  const activePriceMax = parseOptionalInt(resolvedSearchParams?.priceMax);
  const activeAvailability = resolvedSearchParams?.availability === "true";
  const activeTags = toArray(resolvedSearchParams?.tags);

  const hasFilters =
    !!activeType ||
    !!activeFabric ||
    typeof activePriceMin === "number" ||
    typeof activePriceMax === "number" ||
    activeAvailability ||
    activeTags.length > 0;

  const collectionPagePromise = getGlobals("collectionPage", { includeDrafts });
  const visibleCollectionsPromise = getCollections({
    includeDrafts,
    onlyWithProducts: true,
  });

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
  let items: Product[] = [];
  let totalDocs = 0;
  let facets: CatalogFacets = {
    fabric: {},
    type: {},
    availability: {},
    tags: {},
    tagDetails: {},
  };

  if (hasFilters) {
    const result = await searchProducts({
      collectionSlug: activeCollectionSlug,
      type: activeType,
      fabric: activeFabric,
      priceMin: activePriceMin,
      priceMax: activePriceMax,
      availability: activeAvailability || undefined,
      tags: activeTags.length > 0 ? activeTags : undefined,
      limit: visibleLimit,
      sort: activeSort,
    });

    totalDocs = result.totalDocs;
    items = result.products as unknown as Product[];
    facets = result.facets;
  } else if (activeCollectionSlug) {
    if (!includeDrafts) {
      const result = await searchProducts({
        collectionSlug: activeCollectionSlug,
        limit: visibleLimit,
        sort: activeSort,
      });

      items = result.products as unknown as Product[];
      totalDocs = result.totalDocs;
      facets = result.facets;
    } else {
      const { getProductsByCollection } = await import("@/lib/data/products");
      const [result, facetResult] = await Promise.all([
        getProductsByCollection(activeCollectionSlug, visibleLimit, {
          includeDrafts,
          page: 1,
          sort: activeSort,
        }),
        searchProducts({
          collectionSlug: activeCollectionSlug,
          facetsOnly: true,
        }),
      ]);

      items = (result?.docs ?? []) as Product[];
      totalDocs = (result as { totalDocs?: number })?.totalDocs ?? items.length;
      facets = facetResult.facets;
    }
  } else {
    if (!includeDrafts) {
      const result = await searchProducts({
        limit: visibleLimit,
        sort: activeSort,
      });

      items = result.products as unknown as Product[];
      totalDocs = result.totalDocs;
      facets = result.facets;
    } else {
      const { getProducts } = await import("@/lib/data/products");
      const [result, facetResult] = await Promise.all([
        getProducts(visibleLimit, {
          includeDrafts,
          page: 1,
          sort: activeSort,
        }),
        searchProducts({ facetsOnly: true }),
      ]);

      items = (result?.docs ?? []) as Product[];
      totalDocs = (result as { totalDocs?: number })?.totalDocs ?? items.length;
      facets = facetResult.facets;
    }
  }

  const hasMoreProducts = items.length < totalDocs;
  const collectionCount = collections.length;
  const activeCollectionLabel = activeCollection?.name ?? "All pieces";
  const filterDescription =
    activeCollection?.description ??
    cms?.filtersBody ??
    "Choose an edit, then refine by fabric, saree style, occasion, pattern, colour, and availability.";
  const buildUrl = (patch: BuildUrlPatch = {}) => {
    const nextCollectionSlug =
      "collectionSlug" in patch
        ? (patch.collectionSlug ?? undefined)
        : activeCollectionSlug;
    const nextSort =
      "sort" in patch ? (patch.sort ?? DEFAULT_PRODUCT_SORT) : activeSort;
    const nextPage = "page" in patch ? (patch.page ?? 1) : currentPage;
    const nextType = "type" in patch ? (patch.type ?? undefined) : activeType;
    const nextFabric =
      "fabric" in patch ? (patch.fabric ?? undefined) : activeFabric;
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
        ? Boolean(patch.availability)
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
    if (nextType) params.set("type", nextType);
    if (nextFabric) params.set("fabric", nextFabric);
    if (typeof nextPriceMin === "number") {
      params.set("priceMin", String(nextPriceMin));
    }
    if (typeof nextPriceMax === "number") {
      params.set("priceMax", String(nextPriceMax));
    }
    if (nextAvailability) params.set("availability", "true");
    if (nextItemsPerPage !== DEFAULT_ITEMS_PER_PAGE) {
      params.set("perPage", String(nextItemsPerPage));
    }
    for (const tag of nextTags) params.append("tags", tag);

    const qs = params.toString();
    return `/collection${qs ? `?${qs}` : ""}`;
  };

  const hasAnyFilter =
    !!activeCollectionSlug || hasFilters || activeSort !== DEFAULT_PRODUCT_SORT;
  const fabricOptions = Object.entries(facets.fabric)
    .filter(([key]) => key)
    .sort((a, b) => b[1] - a[1]);
  const typeOptions = Object.entries(facets.type)
    .filter(([key]) => key)
    .sort((a, b) => b[1] - a[1]);
  const tagOptions: TagFilterOption[] = Object.entries(facets.tags)
    .filter(([key]) => key)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, count]) => {
      const details = facets.tagDetails[slug];
      return {
        category: details?.category ?? "",
        count,
        label: details?.name ?? humanizeFilterValue(slug),
        slug,
      };
    });
  const groupedTagSlugs = new Set<string>();
  const groupedTagOptions = TAG_FILTER_GROUPS.map((group) => {
    const options = tagOptions
      .filter(
        (option) =>
          !groupedTagSlugs.has(option.slug) &&
          tagOptionMatchesGroup(option, group),
      )
      .slice(0, 10);

    for (const option of options) groupedTagSlugs.add(option.slug);

    return { ...group, options };
  }).filter((group) => group.options.length > 0);
  const moreTagOptions = tagOptions
    .filter((option) => !groupedTagSlugs.has(option.slug))
    .slice(0, 12);
  const availableCount = facets.availability.available ?? 0;
  const appliedFilters: Array<{ label: string; href: string; kind?: string }> =
    [];

  if (activeCollectionSlug) {
    appliedFilters.push({
      label: activeCollectionLabel,
      href: buildUrl({ collectionSlug: null, page: 1 }),
      kind: "collection",
    });
  }

  if (activeType) {
    appliedFilters.push({
      label: humanizeFilterValue(activeType),
      href: buildUrl({ type: null, page: 1 }),
      kind: "type",
    });
  }

  if (activeFabric) {
    appliedFilters.push({
      label: humanizeFilterValue(activeFabric),
      href: buildUrl({ fabric: null, page: 1 }),
      kind: "fabric",
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

  const appliedFilterCount = appliedFilters.filter(
    (filter) => filter.kind !== "sort",
  ).length;

  const renderTagFilterSection = (
    title: string,
    options: TagFilterOption[],
  ) =>
    options.length > 0 ? (
      <FilterSection title={title}>
        {options.map((option) => {
          const isActive = activeTags.includes(option.slug);
          const nextTags = isActive
            ? activeTags.filter((tag) => tag !== option.slug)
            : [...activeTags, option.slug];

          return (
            <FilterPill
              key={option.slug}
              href={buildUrl({ tags: nextTags, page: 1 })}
              active={isActive}
            >
              {option.label}
              <span className="ml-1 opacity-60">({option.count})</span>
            </FilterPill>
          );
        })}
      </FilterSection>
    ) : null;

  const renderFilterPanel = () => (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[var(--ftt-gold)]">
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

      <FilterSection title="Edit">
        <FilterPill
          href={buildUrl({ collectionSlug: null, page: 1 })}
          active={!activeCollectionSlug}
        >
          All pieces
        </FilterPill>

        {collections.map((collection) => (
          <FilterPill
            key={collection.id}
            href={buildUrl({ collectionSlug: collection.slug, page: 1 })}
            active={activeCollectionSlug === collection.slug}
          >
            {collection.name}
          </FilterPill>
        ))}
      </FilterSection>

      {typeOptions.length > 0 ? (
        <FilterSection title="Saree category">
          {typeOptions.map(([type, count]) => (
            <FilterPill
              key={type}
              href={buildUrl({
                type: activeType === type ? null : type,
                page: 1,
              })}
              active={activeType === type}
            >
              {humanizeFilterValue(type)}
              <span className="ml-1 opacity-60">({count})</span>
            </FilterPill>
          ))}
        </FilterSection>
      ) : null}

      {fabricOptions.length > 0 ? (
        <FilterSection title="Fabric">
          {fabricOptions.map(([fabric, count]) => (
            <FilterPill
              key={fabric}
              href={buildUrl({
                fabric: activeFabric === fabric ? null : fabric,
                page: 1,
              })}
              active={activeFabric === fabric}
            >
              {humanizeFilterValue(fabric)}
              <span className="ml-1 opacity-60">({count})</span>
            </FilterPill>
          ))}
        </FilterSection>
      ) : null}

      <FilterSection title="Price">
        {PRICE_RANGES.map((range) => {
          const active =
            activePriceMin === range.min && activePriceMax === range.max;

          return (
            <FilterPill
              key={range.label}
              href={buildUrl({
                priceMin: active ? null : range.min,
                priceMax: active ? null : range.max,
                page: 1,
              })}
              active={active}
            >
              {range.label}
            </FilterPill>
          );
        })}
      </FilterSection>

      <FilterSection title="Availability">
        <FilterPill
          href={buildUrl({
            availability: activeAvailability ? null : true,
            page: 1,
          })}
          active={activeAvailability}
        >
          In stock
          {availableCount > 0 ? (
            <span className="ml-1 opacity-60">({availableCount})</span>
          ) : null}
        </FilterPill>
      </FilterSection>

      {groupedTagOptions.map((group) => (
        <div key={group.key}>
          {renderTagFilterSection(group.title, group.options)}
        </div>
      ))}

      {renderTagFilterSection("More filters", moreTagOptions)}

      <FilterSection title="Sort">
        {PRODUCT_SORT_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            href={buildUrl({ sort: option.value, page: 1 })}
            active={activeSort === option.value}
          >
            {shortSortLabels[option.value]}
          </FilterPill>
        ))}
      </FilterSection>
    </div>
  );

  const renderProduct = (product: Product) => (
    <ProductCard key={product.id} product={product} />
  );

  return (
    <main className="min-h-screen bg-[#FDF7F1] text-[#0E0D0E]">
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
            <CollectionHeroCarousel images={COLLECTION_BANNER_IMAGES} />
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
              <MobileFilterDisclosure activeCount={appliedFilterCount}>
                {renderFilterPanel()}
              </MobileFilterDisclosure>

              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-[var(--ftt-gold)]">
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

              {PRODUCT_SORT_OPTIONS.map((option) => (
                <FilterLink
                  key={option.value}
                  href={buildUrl({ sort: option.value, page: 1 })}
                  className={cn(
                    "inline-flex h-10 min-w-[7.1rem] shrink-0 items-center justify-center rounded-full border px-3 text-xs font-medium uppercase tracking-[0.12em] transition",
                    activeSort === option.value
                      ? "border-[var(--ftt-royal-navy)] bg-[var(--ftt-royal-navy)] text-[var(--ftt-ivory)]"
                      : "border-[var(--ftt-border)] bg-white/60 text-[var(--ftt-muted)] hover:border-[var(--ftt-gold)]/60 hover:text-[var(--ftt-royal-navy)]",
                  )}
                >
                  {shortSortLabels[option.value]}
                </FilterLink>
              ))}
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
                <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-[var(--ftt-gold)]">
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
              <div className="rounded-[1.75rem] border border-dashed border-[var(--ftt-gold)]/50 bg-[var(--ftt-card)] p-8 text-center shadow-sm">
                <p className="font-serif text-3xl text-[var(--ftt-royal-navy)]">
                  The next curated drop is being prepared
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ftt-muted)]">
                  Our team is authenticating fresh heirloom pieces right now.
                  Reset the filters or return shortly for the next trunk edit.
                </p>

                <FilterLink
                  href="/collection"
                  className="mt-6 inline-flex rounded-full bg-[var(--ftt-royal-navy)] px-6 py-3 text-sm font-medium text-[var(--ftt-ivory)] transition hover:bg-[var(--ftt-midnight)]"
                >
                  Reset filters
                </FilterLink>
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
      className={cn(
        "min-w-56 rounded-[1.15rem] border bg-[var(--ftt-card)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(20,29,70,0.10)]",
        active
          ? "border-[var(--ftt-gold)] ring-1 ring-[var(--ftt-gold)]/25"
          : "border-[var(--ftt-border)]",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ftt-gold)]">
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
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--ftt-muted)]">
        {title}
      </p>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <FilterLink
      href={href}
      className={cn(
        "group inline-flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.14em] transition",
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
      <span className="min-w-0">{children}</span>
    </FilterLink>
  );
}
