import { describe, expect, it } from "vitest";

import {
  canonicalizeCollectionSearchParams,
  getCanonicalCollectionLocation,
  hasCollectionFilterParams,
  isCollectionPaginationOnly,
  isValidCollectionSearchParams,
} from "@/lib/seo/collection-filter";

describe("collection filter URL boundary", () => {
  it("normalizes aliases, empty values, order, case, and duplicates", () => {
    const input = new URLSearchParams(
      "colour=White&fabric=Silk&color=ivory&fabric=silk&type=&availability=true",
    );

    expect(canonicalizeCollectionSearchParams(input).toString()).toBe(
      "fabric=silk&color=ivory-white&availability=available",
    );
  });

  it("redirects a valid non-canonical record to one stable shareable URL", () => {
    expect(
      getCanonicalCollectionLocation({
        color: ["red", "blue", "red"],
        page: "02",
      }),
    ).toEqual({
      href: "/collection?page=2&color=blue&color=red",
      isCanonical: false,
      isValid: true,
    });
  });

  it.each([
    "unknown=value",
    "page=11",
    "page=-1",
    "sort=random",
    "priceMin=500&priceMax=100",
    "availability=sold",
    "sort=latest&sort=price-low-to-high",
  ])("rejects invalid or ambiguous state: %s", (query) => {
    expect(isValidCollectionSearchParams(new URLSearchParams(query))).toBe(false);
  });

  it("keeps useful bounded pagination separate from Class B filters", () => {
    expect(isCollectionPaginationOnly({ page: "2" })).toBe(true);
    expect(isCollectionPaginationOnly({ page: "2", color: "red" })).toBe(false);
  });

  it.each([
    "utm_source=newsletter",
    "utm_medium=email",
    "utm_campaign=summer",
    "utm_content=hero",
    "utm_term=sarees",
    "gclid=google-click",
    "fbclid=facebook-click",
    "msclkid=microsoft-click",
    "ttclid=tiktok-click",
  ])("ignores attribution state without turning it into a filter: %s", (query) => {
    const params = new URLSearchParams(query);
    expect(isValidCollectionSearchParams(params)).toBe(true);
    expect(canonicalizeCollectionSearchParams(params).toString()).toBe("");
    expect(
      hasCollectionFilterParams(Object.fromEntries(params.entries())),
    ).toBe(false);
  });

  it("accepts Next.js internal RSC navigation without creating a canonical URL", () => {
    const params = new URLSearchParams("fabric=silk&_rsc=abc123");
    expect(isValidCollectionSearchParams(params)).toBe(true);
    expect(canonicalizeCollectionSearchParams(params).toString()).toBe(
      "fabric=silk",
    );
    expect(
      getCanonicalCollectionLocation({ fabric: "silk", _rsc: "abc123" }),
    ).toEqual({
      href: "/collection?fabric=silk",
      isCanonical: true,
      isValid: true,
    });
  });
});
