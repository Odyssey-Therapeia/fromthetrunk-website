import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const productSlugExistsMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/db/queries/products", () => ({
  productSlugExists: productSlugExistsMock,
}));

import { proxy } from "@/proxy";

describe("proxy product detail pass-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
  });

  it("lets the product detail page handle missing slugs without a proxy DB lookup", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/missing-saree")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
  });

  it("allows existing product detail slugs through without a proxy DB lookup", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/published-saree")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
  });

  it("does not block draft preview product links before the page can read draft mode", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/draft-saree", {
        headers: {
          cookie: "__prerender_bypass=preview-mode-token",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
  });

  it("passes malformed slug encoding through without throwing", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/%E0%A4%A")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
  });
});
