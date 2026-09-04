import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";

const { getProductMock } = vi.hoisted(() => ({
  getProductMock: vi.fn(),
}));

vi.mock("@/db/queries/products", () => ({
  getProduct: getProductMock,
}));

import {
  loadAuthoritativeTryonProduct,
  TryonProductError,
} from "@/lib/drape-room/catalog/product-reference";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_URL =
  "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/tryon-source.jpg";

const makeProduct = (byteSize: number): ProductWithRelations =>
  ({
    id: PRODUCT_ID,
    slug: "trusted-source-saree",
    name: "Trusted Source Saree",
    status: "published",
    stockStatus: "available",
    reservedUntil: null,
    detailsFabric: "Silk",
    pricePaise: 125_000,
    typeSlug: "saree",
    typeName: "Saree",
    tags: [],
    collection: null,
    images: [
      {
        sortOrder: 0,
        media: {
          id: MEDIA_ID,
          url: SOURCE_URL,
          key: "media/tryon-source.jpg",
          filename: "tryon-source.jpg",
          alt: "Trusted Source Saree",
          blurDataUrl: null,
          metadata: null,
          mimeType: "image/jpeg",
          filesize: byteSize,
          width: 3_456,
          height: 5_184,
          derivativeDeliveryActive: false,
          derivatives: [],
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-24T09:00:00.000Z"),
        },
      },
    ],
  }) as unknown as ProductWithRelations;

function responseFor(
  bytes: Uint8Array,
  contentLength = bytes.byteLength,
  url = SOURCE_URL,
) {
  const response = new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "content-length": String(contentLength),
      "content-type": "image/jpeg",
    },
    status: 200,
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("Drape Room authoritative product reference", () => {
  beforeEach(() => {
    getProductMock.mockReset();
  });

  it("fetches an approved original above the customer limit with strict redirect and cache controls", async () => {
    const bytes = new Uint8Array(2_100_000);
    bytes.set([0xff, 0xd8, 0xff]);
    getProductMock.mockResolvedValue(makeProduct(bytes.byteLength));
    const fetchImpl = vi.fn(async () => responseFor(bytes));

    const loaded = await loadAuthoritativeTryonProduct(
      PRODUCT_ID,
      fetchImpl as typeof fetch,
    );

    expect(loaded.references).toHaveLength(1);
    expect(loaded.references[0].bytes).toHaveLength(bytes.byteLength);
    expect(loaded.references[0].mimeType).toBe("image/jpeg");
    expect(loaded.references[0].version).toMatch(
      new RegExp(`^source:${MEDIA_ID}:nohash:[a-z0-9]+:2100000:3456x5184$`),
    );
    expect(loaded.saree.productReferenceVersion).toMatch(
      new RegExp(`^gallery-v2:single:${MEDIA_ID}:[a-f0-9]{16}$`),
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      SOURCE_URL,
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    );
  });

  it("rejects a response whose bytes no longer match the server-owned media metadata", async () => {
    const bytes = new Uint8Array(1_024);
    getProductMock.mockResolvedValue(makeProduct(2_048));
    const fetchImpl = vi.fn(async () => responseFor(bytes, 2_048));

    await expect(
      loadAuthoritativeTryonProduct(PRODUCT_ID, fetchImpl as typeof fetch),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PRODUCT_REFERENCE_UNAVAILABLE",
        name: "TryonProductError",
      } satisfies Partial<TryonProductError>),
    );
  });

  it("fetches the selected full-look and detail references instead of only the card image", async () => {
    const product = makeProduct(1_024);
    const card = product.images[0]!;
    card.media.alt = "Product card crop";
    const fullLookId = "33333333-3333-4333-8333-333333333333";
    const detailId = "44444444-4444-4444-8444-444444444444";
    const fullLookUrl = `https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/full-look.jpg`;
    const detailUrl = `https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/pallu-detail.jpg`;
    const relation = (
      id: string,
      url: string,
      alt: string,
      sortOrder: number,
      width: number,
      height: number,
    ): ProductWithRelations["images"][number] => ({
      sortOrder,
      media: {
        ...card.media,
        id,
        url,
        key: `media/${id}.jpg`,
        filename: `${alt.replaceAll(" ", "-")}.jpg`,
        alt,
        filesize: 1_024,
        width,
        height,
      },
    });
    product.images = [
      card,
      relation(detailId, detailUrl, "Pallu border motif detail", 1, 1_600, 1_600),
      relation(fullLookId, fullLookUrl, "Full length front model look", 2, 1_400, 2_100),
    ];
    getProductMock.mockResolvedValue(product);
    const bytes = new Uint8Array(1_024);
    bytes.set([0xff, 0xd8, 0xff]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      responseFor(bytes, bytes.byteLength, String(input)),
    );

    const loaded = await loadAuthoritativeTryonProduct(
      PRODUCT_ID,
      fetchImpl as typeof fetch,
    );

    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      fullLookUrl,
      detailUrl,
    ]);
    expect(loaded.references.map((reference) => reference.version)).toEqual([
      expect.stringContaining(fullLookId),
      expect.stringContaining(detailId),
    ]);
    expect(loaded.saree.productReferenceVersion).toContain(
      `gallery-v2:dual:${fullLookId}:${detailId}:`,
    );
  });

  it("never fetches a catalogue source above the trusted 16 MB ceiling", async () => {
    getProductMock.mockResolvedValue(makeProduct(16_000_001));
    const fetchImpl = vi.fn();

    await expect(
      loadAuthoritativeTryonProduct(PRODUCT_ID, fetchImpl as typeof fetch),
    ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never fetches a legacy original above the live raster safety ceiling", async () => {
    const product = makeProduct(10_560_458);
    product.images[0]!.media.width = 6_912;
    product.images[0]!.media.height = 10_368;
    getProductMock.mockResolvedValue(product);
    const fetchImpl = vi.fn();

    await expect(
      loadAuthoritativeTryonProduct(PRODUCT_ID, fetchImpl as typeof fetch),
    ).rejects.toMatchObject({ code: "PRODUCT_REFERENCE_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
