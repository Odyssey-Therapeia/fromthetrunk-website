import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf-8");
}

describe("Instagram link fix", () => {
  const footer = readSource("components/layout/site-footer.tsx");

  it("points to the correct Instagram handle (from.thetrunk)", () => {
    expect(footer).toContain("https://www.instagram.com/from.thetrunk/");
  });

  it("does not contain the old wrong handle", () => {
    expect(footer).not.toContain("instagram.com/fromthetrunk");
  });
});

describe("Contact and review capture", () => {
  const connectDialog = readSource("components/layout/connect-dialog.tsx");
  const contactWizard = readSource("components/contact/contact-wizard.tsx");
  const floatingReview = readSource("components/sections/floating-review-tab.tsx");

  it("connect dialog submits to the contact API instead of mailto", () => {
    // The dialog is now a shell around the ContactWizard, which owns the submit.
    expect(connectDialog).toContain("ContactWizard");
    expect(contactWizard).toContain("/api/v2/contact/submit");
    expect(connectDialog).not.toContain("window.location.href = `mailto:");
  });

  it("floating review submits to the feedback API", () => {
    expect(floatingReview).toContain("/api/v2/site-feedback/submit");
  });
});

describe("WhatsApp link fix", () => {
  const footer = readSource("components/layout/site-footer.tsx");

  it("uses the real phone number 919731910202", () => {
    expect(footer).toContain("https://wa.me/919731910202");
  });

  it("does not contain the placeholder number", () => {
    expect(footer).not.toContain("910000000000");
  });
});

describe("Light mode only", () => {
  const header = readSource("components/layout/site-header.tsx");
  const globalsCss = readSource("app/globals.css");

  it("header does not import ThemeToggle", () => {
    expect(header).not.toContain("ThemeToggle");
    expect(header).not.toContain("theme-toggle");
  });

  it("theme-toggle.tsx file is deleted", () => {
    expect(() =>
      readSource("components/layout/theme-toggle.tsx")
    ).toThrow();
  });

  it("globals.css has no .dark block", () => {
    expect(globalsCss).not.toMatch(/\.dark\s*\{/);
  });

  it("globals.css has no dark custom-variant", () => {
    expect(globalsCss).not.toContain("@custom-variant dark");
  });
});

describe("Brand content — Our Story page", () => {
  const ourStory = readSource("app/(site)/our-story/page.tsx");

  it("uses the current elegance hero title", () => {
    expect(ourStory).toContain("Elegance, given a second life.");
  });

  it("contains the current trunk journey narrative", () => {
    expect(ourStory).toContain(
      "From the Trunk (FTT) was born from a simple, heartfelt belief"
    );
  });

  it("has the two-sided trunk story chapter", () => {
    expect(ourStory).toContain("Two women, one trunk.");
  });

  it("has the sustainability chapter", () => {
    expect(ourStory).toContain("Every saree worn again is one less made new.");
  });

  it("has the promise chapter", () => {
    expect(ourStory).toContain("At From the Trunk, we don’t just collect sarees.");
  });

  it("no longer has the old generic card titles", () => {
    expect(ourStory).not.toContain("Curated Heritage");
    expect(ourStory).not.toContain("Authenticated Craft");
    expect(ourStory).not.toContain("Modern Heirlooms");
  });
});

describe("Brand content — BrandStoryTeaser", () => {
  const teaser = readSource("components/sections/brand-story-teaser.tsx");

  it("uses the Bengaluru heading", () => {
    expect(teaser).toContain("Born in Bengaluru, rooted in heritage");
  });

  it("no longer has the old heading", () => {
    expect(teaser).not.toContain("The trunk that carries memories");
  });
});

describe("Brand content — How It Works page", () => {
  const hiw = readSource("app/(site)/how-it-works/page.tsx");

  it("has Sourcing step", () => {
    expect(hiw).toContain('"Sourcing"');
  });

  it("has Quality Control step", () => {
    expect(hiw).toContain('"Quality Control"');
  });

  it("has Eco-Restoration step", () => {
    expect(hiw).toContain('"Eco-Restoration"');
  });

  it("has Sustainable Packaging step", () => {
    expect(hiw).toContain('"Sustainable Packaging"');
  });

  it("has Doorstep Magic step", () => {
    expect(hiw).toContain("Doorstep Magic");
  });

  it("uses the current 'second life' heading", () => {
    expect(hiw).toContain("A second life, handled with care");
  });

  it("no longer has the old generic step titles", () => {
    expect(hiw).not.toContain("Sourcing & Curation");
    expect(hiw).not.toContain("Authentication");
    expect(hiw).not.toContain('"Restoration"');
  });
});

describe("Product gallery UX fix", () => {
  const gallery = readSource("components/product/product-gallery.tsx");
  const productPage = readSource("app/(site)/collection/[slug]/page.tsx");

  it("constrains image height on mobile with viewport-aware height", () => {
    expect(gallery).toContain("h-[min(68vh,620px)]");
  });

  it("uses a stable mobile minimum height", () => {
    expect(gallery).toContain("min-h-[27rem]");
  });

  it("uses the PDP panel height variable on larger screens", () => {
    expect(gallery).toContain("md:min-h-[var(--pdp-panel-height)]");
  });

  it("gallery container avoids mobile stickiness", () => {
    expect(gallery).not.toContain("sticky top-");
  });

  it("thumbnails can scroll horizontally on small screens", () => {
    expect(gallery).toContain("overflow-x-auto");
  });

  it("keeps product details beside the gallery in the responsive PDP grid", () => {
    expect(productPage).toContain("md:grid-cols-[minmax(0,1fr)_minmax(300px,0.58fr)]");
    expect(productPage).toContain(
      "lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.58fr)]"
    );
  });

  it("keeps the purchase controls inside the product dossier panel", () => {
    expect(productPage).toContain("<AddToCartButton");
    expect(productPage).toContain("<WishlistButton");
    expect(productPage).toContain("Product Dossier");
  });
});

describe("Public storefront QA regressions", () => {
  const collectionPage = readSource("app/(site)/collection/page.tsx");
  const productPage = readSource("app/(site)/collection/[slug]/page.tsx");
  const siteHeader = readSource("components/layout/site-header.tsx");

  it("collection filters are sourced from the visible collections query", () => {
    expect(collectionPage).toContain("visibleCollectionsResult");
    expect(collectionPage).toContain("collections.map");
  });

  it("missing product pages explicitly return notFound", () => {
    expect(productPage).toContain("return notFound();");
  });

  it("mobile menu sheet has a visually hidden title", () => {
    expect(siteHeader).toContain("SheetTitle");
    expect(siteHeader).toContain("sr-only");
    expect(siteHeader).toContain("Mobile navigation");
  });
});
