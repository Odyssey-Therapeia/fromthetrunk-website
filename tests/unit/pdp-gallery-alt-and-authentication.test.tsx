/**
 * SEO remediation pass 1 — findings C and D.
 *
 * C: every gallery thumbnail rendered `alt=""`, so the five primary product
 *    photographs on each PDP declared themselves decorative and opted out of
 *    image search. The thumbnail controls also carried the generic label
 *    "View image 2 of 6".
 *
 * D: /authentication returned 200, was indexable and sat in the sitemap, but
 *    had zero internal links anywhere on the site.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductGallery } from "@/components/product/product-gallery";
import { buildPdpGalleryImageAlt } from "@/lib/seo/image-alt";

const PRODUCT_NAME = "Midnight Garden Georgette Saree";

const product = { name: PRODUCT_NAME, detailsFabric: "Georgette" };

const images = [
  "https://cdn.example.com/1.jpg",
  "https://cdn.example.com/2.jpg",
  "https://cdn.example.com/3.jpg",
  "https://cdn.example.com/4.jpg",
  "https://cdn.example.com/5.jpg",
];

const imageAlts = images.map((_, index) =>
  buildPdpGalleryImageAlt(product, index),
);

const renderGallery = () =>
  renderToStaticMarkup(
    createElement(ProductGallery, {
      images,
      alt: imageAlts[0] ?? PRODUCT_NAME,
      imageAlts,
      productName: PRODUCT_NAME,
    }),
  );

const parse = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

describe("ProductGallery image alt text", () => {
  const host = parse(renderGallery());
  const imgs = Array.from(host.querySelectorAll("img"));

  it("renders one img per gallery image plus the active main image", () => {
    expect(imgs.length).toBeGreaterThanOrEqual(images.length);
  });

  it("gives EVERY img a non-empty alt value", () => {
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      const alt = img.getAttribute("alt");
      expect(alt).not.toBeNull();
      expect((alt ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("does not fall back to generic 'Image N' alt text", () => {
    for (const img of imgs) {
      const alt = (img.getAttribute("alt") ?? "").trim();
      expect(alt).not.toMatch(/^image\s*\d+$/i);
    }
  });

  it("names the product in every alt value", () => {
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toContain(PRODUCT_NAME);
    }
  });

  it("does not repeat one identical keyword-stuffed alt across the gallery", () => {
    const alts = imgs.map((img) => (img.getAttribute("alt") ?? "").trim());
    // The main image duplicates thumbnail 0 by design; beyond that, distinct.
    expect(new Set(alts).size).toBeGreaterThan(1);
    expect(new Set(alts).size).toBeGreaterThanOrEqual(images.length);
  });
});

describe("ProductGallery thumbnail controls", () => {
  const host = parse(renderGallery());
  const buttons = Array.from(host.querySelectorAll("button[aria-pressed]"));

  it("renders one selectable control per image", () => {
    expect(buttons.length).toBe(images.length);
  });

  it("labels each control descriptively with the product name", () => {
    buttons.forEach((button, index) => {
      const label = button.getAttribute("aria-label") ?? "";
      expect(label).toContain(PRODUCT_NAME);
      expect(label).not.toMatch(/^View image \d+ of \d+$/);
      if (index > 0) {
        expect(label).toBe(
          `View ${PRODUCT_NAME} detail view ${index + 1}`,
        );
      } else {
        expect(label).toBe(`View ${PRODUCT_NAME} main image`);
      }
    });
  });

  it("preserves aria-pressed state on the controls", () => {
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    for (const button of buttons.slice(1)) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("keeps the controls keyboard-operable native buttons", () => {
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.hasAttribute("disabled")).toBe(false);
    }
  });
});

describe("ProductGallery LCP semantics", () => {
  const host = parse(renderGallery());
  const imgs = Array.from(host.querySelectorAll("img"));

  // next/image expresses `priority` as the ABSENCE of loading="lazy" in the
  // server-rendered markup (it attaches the fetchpriority hint client-side),
  // so the priority image is the only non-lazy <img> in the gallery.
  it("keeps exactly one priority (non-lazy) image — the principal product image", () => {
    const priorityImgs = imgs.filter(
      (img) => img.getAttribute("loading") !== "lazy",
    );
    expect(priorityImgs.length).toBe(1);
    expect(priorityImgs[0]?.getAttribute("alt")).toBe(imageAlts[0]);
  });

  it("keeps thumbnails lazy so more links do not mean more bytes", () => {
    const lazy = imgs.filter(
      (img) => img.getAttribute("loading") === "lazy",
    );
    expect(lazy.length).toBeGreaterThanOrEqual(images.length - 1);
  });

  it("renders an accessible fallback when there are no images", () => {
    const html = renderToStaticMarkup(
      createElement(ProductGallery, {
        images: [],
        alt: PRODUCT_NAME,
        productName: PRODUCT_NAME,
      }),
    );
    expect(html).toContain("No image available");
    expect(parse(html).querySelectorAll("img").length).toBe(0);
  });
});

describe("navbar logo no longer competes for LCP priority", () => {
  const source = readFileSync(
    path.join(process.cwd(), "components/layout/site-header.tsx"),
    "utf8",
  );

  it("drops fetchPriority=high from the header logo", () => {
    expect(source).not.toContain('fetchPriority="high"');
  });

  it("still loads the logo eagerly so the header does not flash empty", () => {
    expect(source).toContain('loading="eager"');
  });

  it("keeps the logo accessible via visually hidden text", () => {
    expect(source).toContain("From the Trunk</span>");
  });
});

describe("/authentication internal linking", () => {
  const read = (relative: string) =>
    readFileSync(path.join(process.cwd(), relative), "utf8");

  it("is linked from the product detail template", () => {
    const pdp = read("app/(site)/collection/[slug]/page.tsx");
    expect(pdp).toContain('href="/authentication"');
  });

  it("uses meaningful anchor text on the product template", () => {
    const pdp = read("app/(site)/collection/[slug]/page.tsx");
    expect(pdp).toMatch(/How FTT authenticates every (saree|piece)/);
  });

  it("places the product link in the trust area, not a hidden block", () => {
    const pdp = read("app/(site)/collection/[slug]/page.tsx");
    const trustIndex = pdp.indexOf("Authenticated by hand");
    const linkIndex = pdp.indexOf('href="/authentication"');
    expect(trustIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(trustIndex);
    // Same trust block, not hundreds of lines away.
    expect(linkIndex - trustIndex).toBeLessThan(900);
  });

  it("is linked directly from the site footer", () => {
    const footer = read("components/layout/site-footer.tsx");
    expect(footer).toContain('href: "/authentication"');
  });

  it("does not add repetitive duplicate links on one template", () => {
    const pdp = read("app/(site)/collection/[slug]/page.tsx");
    const occurrences = pdp.split('href="/authentication"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("is linked from the authenticity FAQ answers", () => {
    const faq = read("lib/seo/faq-content.ts");
    expect(faq).toContain('href: "/authentication"');
    const occurrences = faq.split('href: "/authentication"').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(1);
    expect(occurrences).toBeLessThanOrEqual(3);
  });
});
