import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  expandFabricAliases,
  normalizeFacetSlug,
} from "@/lib/catalog/filter-taxonomy";
import {
  getFabricLandingForLabel,
  getKeywordLandingByTypeSlug,
  keywordLandingPages,
} from "@/lib/seo/keyword-landing-pages";

const searchProductsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ports/catalog-search", () => ({
  searchProducts: searchProductsMock,
}));
vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => (
    <article data-card>{product.name}</article>
  ),
}));

const FABRIC_PAGES = keywordLandingPages.filter((page) => page.type === "fabric");

// The storefront's fabric rule: a normalised product value CONTAINS the slug.
const fabricMatches = (value: string, slugs: string[]) =>
  expandFabricAliases(slugs).some((slug) => normalizeFacetSlug(value).includes(slug));

const results = (names: string[], totalDocs = names.length) => ({
  products: names.map((name, index) => ({ id: `p${index}`, name, slug: `s${index}` })),
  facets: {},
  totalDocs,
});

describe("fabric aliases", () => {
  it("expands each Kanjeevaram spelling, keeping any suffix", () => {
    expect(expandFabricAliases(["kanjeevaram-silk"])).toEqual(
      expect.arrayContaining(["kanjivaram-silk", "kanchipuram-silk"]),
    );
    expect(expandFabricAliases(["kanchipuram"])).toContain("kanjeevaram");
    expect(expandFabricAliases(["silk"])).toEqual(["silk"]);
  });

  it("finds the values Kanjeevaram products carry and leaves Kanchi cotton out", () => {
    const kanjeevaram = getKeywordLandingByTypeSlug("fabric", "kanjeevaram");
    const slugs = kanjeevaram?.searchFilters?.fabrics ?? [];
    for (const value of [
      "Kanjeevaram",
      "KANJIVARAM",
      "Vintage Kanjeevaram",
      "KANJIVARAM MIX",
      "Kanchipuram silk",
    ]) {
      expect(fabricMatches(value, slugs), value).toBe(true);
    }
    expect(fabricMatches("Kanchi cotton", slugs)).toBe(false);
    expect(fabricMatches("Silk", slugs)).toBe(false);
  });

  it("links a Kanchipuram product to the Kanjeevaram page", () => {
    expect(getFabricLandingForLabel("Kanchipuram Silk")?.slug).toBe("kanjeevaram");
    expect(getFabricLandingForLabel("Kanchi cotton")).toBeUndefined();
  });
});

describe("fabric landing configuration", () => {
  it("gives every fabric page a saree-only product section and a matching View all filter", () => {
    expect(FABRIC_PAGES.map((page) => page.slug)).toEqual([
      "silk",
      "kanjeevaram",
      "chiffon",
      "georgette",
    ]);
    for (const page of FABRIC_PAGES) {
      const fabric = page.searchFilters?.fabrics?.[0];
      expect(page.searchFilters?.excludeTypes).toEqual(["blouse"]);
      expect(page.searchFilters?.availabilityStatus).toBe("available");
      expect(page.productSection?.viewAllHref).toBe(`/collection?fabric=${fabric}`);
      expect(page.productSection?.heading).toMatch(/ sarees in the trunk$/);
      const related = getKeywordLandingByTypeSlug(
        "fabric",
        page.productSection?.relatedEdit ?? "",
      );
      expect(related?.slug).not.toBe(page.slug);
    }
  });

  it("keeps indexing and sitemap talk out of shopper-facing copy", () => {
    for (const page of keywordLandingPages) {
      const copy = [...page.intro, ...page.faq.flatMap((item) => [item.question, item.answer])].join(" ");
      expect(copy, page.slug).not.toMatch(/sitemap|index|landing page|SEO|doorway|threshold/i);
    }
  });
});

describe("KeywordProductLandingPage", () => {
  beforeEach(() => {
    searchProductsMock.mockReset();
  });

  const render = async (slug: string) => {
    const { KeywordProductLandingPage } = await import(
      "@/components/seo/keyword-product-landing-page"
    );
    const config = getKeywordLandingByTypeSlug("fabric", slug)!;
    return renderToStaticMarkup(await KeywordProductLandingPage({ config }));
  };

  it("shows the fabric's cards after the introduction, with a count and View all link", async () => {
    searchProductsMock.mockResolvedValue(results(["Temple border Kanjeevaram"], 13));
    const html = await render("kanjeevaram");

    expect(html).toContain("Kanjeevaram sarees in the trunk");
    expect(html.indexOf("Kanjeevaram sarees in the trunk")).toBeGreaterThan(
      html.indexOf("Every piece is sourced one by one"),
    );
    expect(html).toContain("Showing 1 of 13 pieces available now");
    expect(html).toContain('href="/collection?fabric=kanjeevaram"');
    expect(html).toContain("In this edit");
    expect(html).not.toMatch(/Page status|sitemap|indexed/i);
    expect(html).not.toContain("You may also like");
    expect(searchProductsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the empty state and labels related silk pieces as silk", async () => {
    searchProductsMock
      .mockResolvedValueOnce(results([]))
      .mockResolvedValueOnce(results(["Gold silk saree"]));
    const html = await render("kanjeevaram");

    expect(html).toContain("This edit is waiting for the right pieces.");
    expect(html).toContain("Browse all sarees");
    expect(html).toContain("You may also like");
    expect(html).toContain("Silk sarees in the trunk");
    expect(html).not.toContain("Kanjeevaram sarees in the trunk");
    expect(searchProductsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ fabrics: ["silk"], availabilityStatus: "available" }),
    );
  });
});
