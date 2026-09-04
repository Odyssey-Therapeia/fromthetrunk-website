import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { derivativeQuery, select } = vi.hoisted(() => ({
  derivativeQuery: vi.fn(() => {
    throw new Error('relation "media_derivatives" does not exist');
  }),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select },
  withRetry: (operation: () => unknown) => operation(),
}));

vi.mock("@/db/queries/media-derivatives", () => ({
  assertMediaAssetsReadyForPublication: vi.fn(),
  listReadyMediaDerivativesForAssets: derivativeQuery,
}));

import { hydrateProducts } from "@/db/queries/products";

function queryResult<T>(value: T) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    then: (
      resolveValue: (result: T) => unknown,
      rejectValue?: (reason: unknown) => unknown,
    ) => Promise.resolve(value).then(resolveValue, rejectValue),
  };
  return builder;
}

describe("Drape Room media-derivative independence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("hydrates safe original media without touching an absent derivative table", async () => {
    for (const name of [
      "FTT_MEDIA_DERIVATIVE_PUBLISH_GUARD",
      "FTT_MEDIA_DERIVATIVE_UPLOADS_ENABLED",
      "FTT_MEDIA_DERIVATIVES_ACTIVE",
      "FTT_MEDIA_EXECUTION_ENVIRONMENT",
      "FTT_MEDIA_DATABASE_ID",
      "FTT_MEDIA_BLOB_STORE_ID",
      "FTT_MEDIA_DERIVATIVE_BLOB_TOKEN",
      "FTT_MEDIA_DERIVATIVE_DESTINATION_HOST",
    ]) {
      vi.stubEnv(name, "");
    }

    const product = {
      id: "11111111-1111-4111-8111-111111111111",
      collectionId: null,
      typeId: null,
    };
    const media = {
      id: "22222222-2222-4222-8222-222222222222",
      url: "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/safe-original.jpg",
      mimeType: "image/jpeg",
      filesize: 1_000_000,
      width: 1_200,
      height: 1_800,
    };
    select
      .mockReturnValueOnce(
        queryResult([{ productId: product.id, sortOrder: 0, media }]),
      )
      .mockReturnValueOnce(queryResult([]));

    const hydrated = await hydrateProducts([product as never]);

    expect(derivativeQuery).not.toHaveBeenCalled();
    expect(hydrated[0]?.images[0]?.media).toMatchObject({
      derivativeDeliveryActive: false,
      derivatives: [],
      url: media.url,
    });
  });

  it("keeps normal environment examples free of FTT_MEDIA runtime keys", async () => {
    for (const file of [".env.example", ".env.production.example"]) {
      const source = await readFile(resolve(process.cwd(), file), "utf8");
      const configuredKeys = source
        .split("\n")
        .filter((line) => /^FTT_MEDIA_[A-Z0-9_]+=/.test(line));
      expect(configuredKeys).toEqual([]);
      expect(source).toContain(
        "# Not required for ordinary Drape Room runtime.",
      );
    }
  });
});
