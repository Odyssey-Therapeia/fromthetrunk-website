import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getProductBySlugMock = vi.hoisted(() => vi.fn());
const getProductsMock = vi.hoisted(() => vi.fn());
const getKeywordLandingProductsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data/products", () => ({
  getProductBySlug: getProductBySlugMock,
  getProducts: getProductsMock,
}));

vi.mock("@/components/seo/keyword-product-landing-page", () => ({
  getKeywordLandingProducts: getKeywordLandingProductsMock,
  KeywordProductLandingPage: () => null,
}));

vi.mock("@/lib/data/catalog-cache", () => ({
  getCachedCatalogFacets: vi.fn(),
  getCachedCollectionPage: vi.fn(),
  getCachedSearchProducts: vi.fn(),
  getCachedVisibleCollections: vi.fn(),
}));

type MetadataRecord = Record<string, unknown>;

const metadataJson = (metadata: unknown) => JSON.stringify(metadata);

const firstOgImage = (metadata: { openGraph?: MetadataRecord }) =>
  ((metadata.openGraph?.images as unknown[]) ?? [])[0] as MetadataRecord;

const firstTwitterImage = (metadata: { twitter?: MetadataRecord }) =>
  ((metadata.twitter?.images as unknown[]) ?? [])[0] as MetadataRecord;

const expectSafeSocialMetadata = (metadata: {
  openGraph?: MetadataRecord;
  twitter?: MetadataRecord;
}) => {
  const serialized = metadataJson(metadata);
  const ogImage = firstOgImage(metadata);
  const twitterImage = firstTwitterImage(metadata);

  expect(metadata.openGraph).toMatchObject({
    siteName: "From The Trunk",
    locale: "en_IN",
    type: "website",
  });
  expect(metadata.twitter).toMatchObject({
    card: "summary_large_image",
  });
  expect(ogImage.url).toEqual(expect.stringMatching(/^https:\/\//));
  expect(ogImage.alt).toEqual(expect.any(String));
  expect(twitterImage.url).toBe(ogImage.url);
  expect(twitterImage.alt).toBe(ogImage.alt);
  expect(serialized).not.toContain("localhost");
  expect(serialized).not.toContain("127.0.0.1");
  expect(serialized).not.toContain("unsplash");
  expect(serialized).not.toContain("pexels");
  expect(serialized).not.toContain("pixabay");
};

const productFixture = (overrides: MetadataRecord = {}) => ({
  id: "p_eligible",
  name: "Tangerine Noir Floral Border Weave",
  slug: "tangerine-noir-floral-border-weave",
  status: "published",
  stockStatus: "available",
  pricePaise: 1250000,
  detailsFabric: "Chiffon",
  detailsCondition: "Excellent",
  detailsLength: "Standard saree drape",
  detailsWidth: "Standard saree width",
  storyNarrative: "A restored chiffon saree with a floral border and provenance.",
  storyTitle: "A restored chiffon story",
  images: [
    {
      media: {
        url: "/media/tangerine-noir.jpg",
        alt: "Tangerine chiffon saree photographed for From the Trunk",
        width: 1600,
        height: 2400,
      },
      sortOrder: 0,
    },
  ],
  tags: [],
  collection: null,
  metadata: null,
  ...overrides,
});

describe("OG and social preview metadata", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://www.fromthetrunk.shop");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    getProductBySlugMock.mockReset();
    getProductsMock.mockReset();
    getProductsMock.mockResolvedValue({ docs: [] });
    getKeywordLandingProductsMock.mockReset();
    getKeywordLandingProductsMock.mockResolvedValue({ totalDocs: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds complete Open Graph and Twitter metadata for public pages", async () => {
    const { publicPageMetadata, DEFAULT_SOCIAL_IMAGE } = await import(
      "@/lib/seo/metadata"
    );

    const metadata = publicPageMetadata({
      title: "Collection",
      description: "Curated authenticated pre-loved luxury sarees.",
      path: "/collection",
    }) as { openGraph?: MetadataRecord; twitter?: MetadataRecord };
    const ogImage = firstOgImage(metadata);

    expectSafeSocialMetadata(metadata);
    expect(metadata.openGraph?.url).toBe("https://www.fromthetrunk.shop/collection");
    expect(ogImage).toMatchObject({
      url: "https://www.fromthetrunk.shop/banner/collection_banner.png",
      width: DEFAULT_SOCIAL_IMAGE.width,
      height: DEFAULT_SOCIAL_IMAGE.height,
      alt: DEFAULT_SOCIAL_IMAGE.alt,
    });
  });

  it("keeps collection metadata indexable with complete social image fields", async () => {
    const collectionPage = await import("@/app/(site)/collection/page");
    const metadata = (await collectionPage.generateMetadata({})) as {
      openGraph?: MetadataRecord;
      robots?: MetadataRecord;
      twitter?: MetadataRecord;
    };

    expect(metadata.robots).toEqual({ index: true, follow: true });
    expectSafeSocialMetadata(metadata);
    expect(firstOgImage(metadata)).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });

  it("keeps /blouses noindex while giving it non-promotional social metadata", async () => {
    const blousePage = await import("@/app/(site)/blouses/page");
    const metadata = (await blousePage.generateMetadata()) as {
      openGraph?: MetadataRecord;
      robots?: MetadataRecord;
      twitter?: MetadataRecord;
    };

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expectSafeSocialMetadata(metadata);
    expect(firstOgImage(metadata).url).toBe(
      "https://www.fromthetrunk.shop/banner/collection_banner.png",
    );
  });

  it("uses product-specific social metadata for SEO-eligible PDPs", async () => {
    getProductBySlugMock.mockResolvedValue(productFixture());
    const pdp = await import("@/app/(site)/collection/[slug]/page");
    const metadata = (await pdp.generateMetadata({
      params: Promise.resolve({ slug: "tangerine-noir-floral-border-weave" }),
    })) as {
      openGraph?: MetadataRecord;
      robots?: MetadataRecord;
      twitter?: MetadataRecord;
    };
    const ogImage = firstOgImage(metadata);

    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.title).toBe(
      "Tangerine Noir Floral Border Weave – Pre-Loved Chiffon Saree",
    );
    expect(ogImage).toMatchObject({
      url: "https://www.fromthetrunk.shop/media/tangerine-noir.jpg",
      width: 1600,
      height: 2400,
      alt: "Tangerine chiffon saree photographed for From the Trunk",
    });
    expectSafeSocialMetadata(metadata);
  });

  it("falls back to brand-safe metadata when a product image URL is unsafe", async () => {
    getProductBySlugMock.mockResolvedValue(
      productFixture({
        images: [
          {
            media: {
              url: "https://images.unsplash.com/photo-1",
              alt: "Unsafe stock image",
              width: 1200,
              height: 1800,
            },
            sortOrder: 0,
          },
        ],
      }),
    );
    const pdp = await import("@/app/(site)/collection/[slug]/page");
    const metadata = (await pdp.generateMetadata({
      params: Promise.resolve({ slug: "tangerine-noir-floral-border-weave" }),
    })) as {
      openGraph?: MetadataRecord;
      twitter?: MetadataRecord;
    };

    expect(firstOgImage(metadata)).toMatchObject({
      url: "https://www.fromthetrunk.shop/banner/collection_banner.png",
      width: 1920,
      height: 1080,
    });
    expectSafeSocialMetadata(metadata);
  });

  it("does not promote QA/test PDPs with product-specific social metadata", async () => {
    getProductBySlugMock.mockResolvedValue(
      productFixture({
        id: "p_blouse_qa",
        name: "StretchFit Blouse",
        slug: "stretchfit-blouse",
        pricePaise: 100,
        typeSlug: "blouse",
        storyTitle: "Untitled Product",
        storyNarrative: null,
        images: [
          {
            media: {
              url: "/media/stretchfit-blouse.jpg",
              alt: "QA blouse image",
              width: 1200,
              height: 1600,
            },
            sortOrder: 0,
          },
        ],
      }),
    );
    const pdp = await import("@/app/(site)/collection/[slug]/page");
    const metadata = (await pdp.generateMetadata({
      params: Promise.resolve({ slug: "stretchfit-blouse" }),
    })) as {
      openGraph?: MetadataRecord;
      robots?: MetadataRecord;
      title?: string;
      twitter?: MetadataRecord;
    };
    const serialized = metadataJson(metadata);

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("From The Trunk Product");
    expect(metadata.openGraph?.title).toBe("From The Trunk Product");
    expect(firstOgImage(metadata).url).toBe(
      "https://www.fromthetrunk.shop/banner/collection_banner.png",
    );
    expect(serialized).not.toContain("StretchFit Blouse");
    expect(serialized).not.toContain("stretchfit-blouse.jpg");
    expectSafeSocialMetadata(metadata);
  });
});
