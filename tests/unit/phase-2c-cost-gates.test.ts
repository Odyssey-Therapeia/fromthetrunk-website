import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";
import robots from "@/app/robots";
import {
  MAX_PUBLIC_SEARCH_QUERY_LENGTH,
  normalizePublicSearchQuery,
} from "@/lib/search/query";

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), "utf8");
const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

describe("Phase 2C cost and media regression gates", () => {
  it("ships no MP4 and keeps every former URL on an exact cheap redirect", async () => {
    expect(
      walk(join(root, "public")).filter((file) => file.toLowerCase().endsWith(".mp4")),
    ).toEqual([]);
    const intro = source("components/sections/home-intro-gate.tsx");
    expect(intro).not.toContain("video/mp4");
    expect(intro).not.toContain(".mp4");
    expect(intro).toContain('preload="none"');
    expect(intro).not.toContain("autoPlay");

    const redirects = await nextConfig.redirects?.();
    for (const oldPath of [
      "/Welcoming.mp4",
      "/video/welcoming-v2.mp4",
      "/seo-candidates/welcoming-1080p-crf30-muted.mp4",
    ]) {
      expect(redirects).toContainEqual({
        source: oldPath,
        destination: "/welcome-poster.avif",
        permanent: true,
      });
    }
  });

  it("keeps secondary carousels manual and constrains hero autoplay", () => {
    for (const file of [
      "components/sections/campaign-banner-section.tsx",
      "components/sections/fabric-category-motion-grid.tsx",
      "components/sections/social-reel-carousel.tsx",
    ]) {
      expect(source(file)).not.toContain("setInterval(");
    }
    // The collection hero autoplays by product decision. It stays gated: no
    // free-running interval, lazy slide mounting preserved, a bounded cadence,
    // and it must stop for reduced motion and while the viewer interacts.
    const collectionHero = source(
      "components/sections/home-hero-carousel.tsx",
    );
    expect(collectionHero).not.toContain("setInterval(");
    expect(collectionHero).toContain("mountedIndices.has(index)");
    expect(collectionHero).not.toContain("CAROUSEL_START_DELAY_MS");
    expect(collectionHero).toContain("const SLIDE_DURATION_MS = 6000;");
    expect(collectionHero).toContain(
      "if (slideCount <= 1 || prefersReducedMotion || isPaused) return;",
    );
    expect(collectionHero).toContain("onMouseEnter={pause}");
    expect(collectionHero).toContain("onFocusCapture={pause}");
    const hero = source("components/sections/hero-section.tsx");
    expect(hero).toContain("const SLIDE_DURATION_MS = 5000;");
    expect(hero).not.toContain("autoplayArmed");
    expect(hero).toContain(
      "prefersReducedMotion || !isIntroReady || !initialHeroImageReady",
    );
  });

  it("keeps product cards lazy and the PDP main/thumbnail roles separate", () => {
    const card = source("components/product/product-card.tsx");
    expect(card).toContain('loading="lazy"');
    expect(card).toContain('"card"');
    expect(card).not.toMatch(/<Image[\s\S]{0,300}\bpriority\b/);

    const pdp = source("app/(site)/collection/[slug]/page.tsx");
    expect(pdp).toContain('resolveCurrentProductImage(img, "pdp")');
    expect(pdp).toContain('"thumbnail"');
    expect(pdp).toContain("galleryEntries");
    const gallery = source("components/product/product-gallery.tsx");
    expect(gallery).toContain("thumbnailImages?.[index]");
    expect(gallery).toContain("src={activeImage}");
  });

  it("keeps search inputs and server result sets bounded", () => {
    const long = `  silk ${" heirloom".repeat(30)}  `;
    const normalized = normalizePublicSearchQuery(long);
    expect(normalized.length).toBeLessThanOrEqual(
      MAX_PUBLIC_SEARCH_QUERY_LENGTH,
    );
    expect(normalized).not.toMatch(/\s{2,}/);
    expect(source("app/(site)/search/page.tsx")).toContain("limit: 24");
    expect(source("api/hono/routes/search.ts")).toContain(
      "includeFacets: false",
    );
    const authMiddleware = source("api/hono/middleware/auth.ts");
    expect(authMiddleware).toContain("isProvenPublicRead");
    expect(authMiddleware).toContain('pathname === "/api/v2/search"');
  });

  it("preserves search/social crawling while advising training crawlers away", () => {
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(true);
    const groups = rules as Array<{
      allow?: string | string[];
      disallow?: string | string[];
      userAgent: string | string[];
    }>;
    expect(groups[0]).toMatchObject({ userAgent: "*", allow: "/" });
    const trainingGroup = groups.find((group) =>
      Array.isArray(group.userAgent),
    );
    expect(trainingGroup?.userAgent).toEqual(
      expect.arrayContaining(["Meta-ExternalAgent", "GPTBot", "Google-Extended"]),
    );
    expect(trainingGroup?.disallow).toBe("/");
    expect(JSON.stringify(groups)).not.toContain("Googlebot");
    expect(JSON.stringify(groups)).not.toContain("Bingbot");
    expect(JSON.stringify(groups)).not.toContain("facebookexternalhit");
  });

  it("keeps the mobile LCP budget blocking at 2.5 seconds", () => {
    const lighthouse = source("lighthouserc.cjs");
    expect(lighthouse).toContain('"largest-contentful-paint"');
    expect(lighthouse).toContain("maxNumericValue: 2500");
    expect(lighthouse).not.toContain("maxNumericValue: 3000");
  });

  it("keeps cleanup reporting dry-run only", () => {
    expect(existsSync(join(root, "scripts/media/report-legacy-cleanup.ts"))).toBe(
      true,
    );
    const cleanup = source("scripts/media/report-legacy-cleanup.ts");
    expect(cleanup).toContain('args.has("--execute")');
    expect(cleanup).toContain("destructiveActionsAvailable: false");
    expect(cleanup).not.toContain("@vercel/blob");
  });
});
