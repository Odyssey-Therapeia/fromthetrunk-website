import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { FilterLink } from "@/components/collection/filter-link";

describe("collection filter control", () => {
  it("renders an accessible button without a crawler-visible href", () => {
    const html = renderToStaticMarkup(
      <FilterLink
        aria-label="Filter red"
        aria-pressed
        href="/collection?color=red"
      >
        Red
      </FilterLink>,
    );

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Filter red"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("href=");
  });

  it("keeps promoted header routes crawlable without legacy filter anchors", () => {
    for (const file of [
      "components/layout/site-header-nav.tsx",
      "components/layout/site-header-controls.tsx",
      "components/layout/site-header.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain('href: "/top-viewed"');
      expect(source).toContain('href: "/blouses"');
      expect(source).not.toContain('/collection?tags=top-viewed');
      expect(source).not.toContain('/collection?type=blouse');
    }
  });

  it("routes arbitrary homepage fabric states through button controls", () => {
    const source = readFileSync(
      join(process.cwd(), "components/sections/fabric-category-motion-grid.tsx"),
      "utf8",
    );
    expect(source).toContain('fabric.href.includes("?")');
    expect(source).toContain("<FilterLink");
  });
});
