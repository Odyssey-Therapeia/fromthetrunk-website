import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("pre-Vercel product media hardening contracts", () => {
  it("keeps every product image role in one current-record resolver", () => {
    const resolver = source("lib/media/product-image-resolver.ts");

    for (const role of ["card", "thumbnail", "pdp", "seo", "social", "feed"]) {
      expect(resolver).toContain(`"${role}"`);
    }
    expect(resolver).toContain("fallbackToOriginal");
    expect(resolver).toContain("unknown_dimensions");
    expect(resolver).toContain("unsupported_mime");
  });

  it("uses the shared resolver on customer, sitemap, social, and feed surfaces", () => {
    for (const relativePath of [
      "components/product/product-card.tsx",
      "app/(site)/collection/[slug]/page.tsx",
      "lib/seo/image-urls.ts",
      "lib/seo/og-data.ts",
      "lib/channels/feed-mapping.ts",
    ]) {
      expect(source(relativePath)).toContain("product-image-resolver");
    }
  });

  it("keeps a bounded local failure fallback on visible product image surfaces", () => {
    const component = source("components/media/resilient-product-image.tsx");

    expect(component).toContain("Broken_Missing_Product_Image.avif");
    expect(component).toContain("failedSource === sourceKey");
    expect(component).not.toContain("window.location.reload");
  });

  it("preloads the exact first hero candidate for mobile and desktop", () => {
    const home = source("app/(site)/page.tsx");
    const hero = source("components/sections/hero-section.tsx");

    expect(home).toContain('href="/hero/mobile_1-lcp.webp"');
    expect(home).toContain('media="(max-width: 767px)"');
    expect(home).toContain('href="/hero/3-lcp.webp"');
    expect(home).toContain('media="(min-width: 768px)"');
    expect(hero).toContain('mobileImage: "/hero/mobile_1-lcp.webp"');
    expect(hero).toContain('image: "/hero/3-lcp.webp"');
  });

  it("starts the collection hero preload before catalogue data awaits", () => {
    const collection = source("app/(site)/collection/page.tsx");
    const catalogueAwait = collection.indexOf(
      "const [collectionPage, visibleCollectionsResult] = await Promise.all",
    );
    const preloadCall = collection.lastIndexOf(
      "preloadCollectionHero(",
      catalogueAwait,
    );

    expect(preloadCall).toBeGreaterThan(0);
    expect(catalogueAwait).toBeGreaterThan(preloadCall);
  });

  it("keeps optional intro media and Vercel telemetry off the initial local path", () => {
    const intro = source("components/sections/home-intro-gate.tsx");
    const layout = source("app/(site)/layout.tsx");

    expect(intro).toContain('const [phase, setPhase] = useState<IntroPhase>("done")');
    expect(intro).toContain('preload="none"');
    expect(layout).toContain('process.env.VERCEL === "1"');
  });
});
