/**
 * SEO remediation pass 1 — finding E (low-severity hygiene batch).
 *
 * E.1  The /collection <h1> rendered "Pre-Loved&amp; Vintage Luxury Sarees":
 *      JSX dropped the space between the nowrap <span> and the ampersand, so
 *      readers saw "Pre-Loved& Vintage".
 * E.2  Homepage canonical host/scheme consistency.
 * E.4  sitemap.xml stamped every static, policy and keyword URL with one frozen
 *      constant (2026-04-27), which is not a modification date.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { policies } from "@/lib/legal/policies";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl, getCanonicalOrigin } from "@/lib/seo/site-url";

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

// ---------------------------------------------------------------------------
// E.1 — the ampersand defect
// ---------------------------------------------------------------------------

describe("collection H1 ampersand spacing", () => {
  const source = read("app/(site)/collection/page.tsx");

  it("does not place the ampersand directly against the closing span", () => {
    // The defective form: `</span> &amp;` followed by a newline, which JSX
    // collapsed into `</span>&amp;`.
    expect(source).not.toMatch(/<\/span> &amp;\s*\n/);
  });

  it("forces the separating space with an explicit JSX expression", () => {
    expect(source).toContain(
      '<span className="whitespace-nowrap">Pre-Loved</span>{" "}',
    );
  });

  it("keeps the heading copy intact", () => {
    expect(source).toContain("&amp; Vintage Luxury Sarees");
  });
});

// ---------------------------------------------------------------------------
// E.2 — homepage canonical consistency
// ---------------------------------------------------------------------------

describe("homepage canonical", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves to the https www production host", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const url = new URL(absoluteUrl("/"));
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.fromthetrunk.shop");
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
  });

  it("never emits a preview or localhost origin in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://ftt-preview.vercel.app");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getCanonicalOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("uses the same origin for the homepage and every other public page", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const home = publicPageMetadata({
      title: "t",
      description: "d",
      path: "/",
    }).alternates?.canonical;
    const other = publicPageMetadata({
      title: "t",
      description: "d",
      path: "/authentication",
    }).alternates?.canonical;

    expect(new URL(String(home)).origin).toBe(new URL(String(other)).origin);
    // The site runs Next's default trailingSlash:false policy, so no non-root
    // canonical may carry a trailing slash.
    expect(String(other)).not.toMatch(/\/$/);
  });
});

// ---------------------------------------------------------------------------
// E.4 / E.5 — truthful sitemap timestamps
// ---------------------------------------------------------------------------

describe("sitemap lastModified", () => {
  const source = read("app/sitemap.ts");

  it("no longer stamps every URL with a frozen constant", () => {
    expect(source).not.toContain("STATIC_PAGE_LAST_MODIFIED");
    expect(source).not.toContain("2026-04-27");
  });

  it("does not invent a deployment-time lastmod", () => {
    // A build-time `new Date()` would mark every URL as modified on deploy.
    expect(source).not.toMatch(/lastModified:\s*new Date\(\s*\)/);
  });

  it("omits lastModified for static routes that have no real timestamp", () => {
    const staticBlock = source.slice(
      source.indexOf("const staticPages"),
      source.indexOf("const policyPages"),
    );
    expect(staticBlock).toContain('absoluteUrl("/")');
    expect(staticBlock).not.toContain("lastModified");
  });

  it("derives policy lastModified from the date printed on the policy page", () => {
    expect(source).toContain("parsePolicyLastUpdated(policy.lastUpdated)");
    expect(source).toContain("...(lastModified ? { lastModified } : {})");
  });

  it("keeps the real product updatedAt timestamp", () => {
    expect(source).toContain("lastModified: new Date(product.updatedAt)");
  });

  it("every policy exposes a parseable lastUpdated date", () => {
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      const parsed = new Date(`${policy.lastUpdated} UTC`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getUTCFullYear()).toBeGreaterThan(2020);
    }
  });
});

// ---------------------------------------------------------------------------
// E.3 — footer already points at final destinations
// ---------------------------------------------------------------------------

describe("footer policy links", () => {
  const footer = read("components/layout/site-footer.tsx");

  it("links the canonical /policies/* destinations, not the 308 aliases", () => {
    for (const legacy of [
      '"/privacy-policy"',
      '"/return-policy"',
      '"/shipping-policy"',
      '"/terms-of-service"',
    ]) {
      expect(footer).not.toContain(`href: ${legacy}`);
    }
    expect(footer).toContain('href: "/policies/privacy-policy"');
    expect(footer).toContain('href: "/policies/return-refund-policy"');
  });
});
