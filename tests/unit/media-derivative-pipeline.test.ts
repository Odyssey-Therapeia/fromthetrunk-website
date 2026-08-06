import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { MediaDerivativeRecord } from "@/db/queries/media-derivatives";
import {
  generateMediaDerivatives,
  renderMediaDerivative,
  type DerivativeBlobStore,
  type DerivativeRepository,
} from "@/lib/media/derivative-generator";
import {
  MEDIA_DERIVATIVE_BUDGETS,
  MEDIA_DERIVATIVE_GENERATION_VERSION,
  MEDIA_DERIVATIVE_ROLES,
} from "@/lib/media/derivative-policy";

const HOST = "njufw8f4mlcjsl7g.public.blob.vercel-storage.com";
process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST = HOST;
const NOW = new Date("2026-08-04T00:00:00.000Z");

const fixture = (background: string) =>
  sharp({
    create: {
      background,
      channels: 3,
      height: 2_000,
      width: 1_600,
    },
  })
    .png()
    .toBuffer();

const makeRepository = () => {
  const rows = new Map<string, MediaDerivativeRecord>();
  const identity = (mediaAssetId: string, role: string) =>
    `${mediaAssetId}:${role}:${MEDIA_DERIVATIVE_GENERATION_VERSION}`;
  const repository: DerivativeRepository = {
    async listForAsset(mediaAssetId) {
      return Array.from(rows.values()).filter(
        (row) => row.mediaAssetId === mediaAssetId,
      );
    },
    async markProcessing(input) {
      const key = identity(input.mediaAssetId, input.role);
      const current = rows.get(key);
      if (current?.status === "ready") return current;
      const row = {
        id: current?.id ?? crypto.randomUUID(),
        ...input,
        byteSize: null,
        createdAt: current?.createdAt ?? NOW,
        failureReason: null,
        height: null,
        mimeType: null,
        status: "processing" as const,
        updatedAt: NOW,
        url: null,
        width: null,
      };
      rows.set(key, row);
      return row;
    },
    async recordFailure(input) {
      const key = identity(input.mediaAssetId, input.role);
      const current = rows.get(key);
      if (current?.status === "ready") {
        const retained = { ...current, failureReason: input.failureReason };
        rows.set(key, retained);
        return retained;
      }
      const failed = {
        id: current?.id ?? crypto.randomUUID(),
        ...input,
        byteSize: null,
        createdAt: current?.createdAt ?? NOW,
        height: null,
        mimeType: null,
        status: "failed" as const,
        updatedAt: NOW,
        url: null,
        width: null,
      };
      rows.set(key, failed);
      return failed;
    },
    async saveReady(input) {
      const key = identity(input.mediaAssetId, input.role);
      const current = rows.get(key);
      const ready = {
        id: current?.id ?? crypto.randomUUID(),
        ...input,
        createdAt: current?.createdAt ?? NOW,
        failureReason: null,
        status: "ready" as const,
        updatedAt: NOW,
      };
      rows.set(key, ready);
      return ready;
    },
  };
  return { repository, rows };
};

const makeBlobStore = () => {
  const uploads: Array<{ body: Buffer; objectKey: string }> = [];
  const blobStore: DerivativeBlobStore = {
    async uploadImmutable({ body, objectKey }) {
      uploads.push({ body, objectKey });
      return {
        byteSize: body.byteLength,
        url: `https://${HOST}/${objectKey}`,
      };
    },
  };
  return { blobStore, uploads };
};

describe("media derivative generation pipeline", () => {
  it("is idempotent for the same source and generation version", async () => {
    const sourceBody = await fixture("#7a2f3b");
    const { repository, rows } = makeRepository();
    const { blobStore, uploads } = makeBlobStore();
    const input = {
      blobStore,
      loadSource: async () => sourceBody,
      repository,
      source: {
        id: "11111111-1111-4111-8111-111111111111",
        mimeType: "image/png",
        updatedAt: NOW,
        url: `https://${HOST}/media/source.png`,
      },
    };

    const first = await generateMediaDerivatives(input);
    const second = await generateMediaDerivatives(input);

    expect(first.roles.every((role) => role.status === "generated")).toBe(true);
    expect(second.roles.every((role) => role.status === "skipped")).toBe(true);
    expect(uploads).toHaveLength(MEDIA_DERIVATIVE_ROLES.length);
    expect(rows).toHaveLength(MEDIA_DERIVATIVE_ROLES.length);
  });

  it("creates new immutable keys for a source revision without duplicating active rows", async () => {
    let sourceBody = await fixture("#7a2f3b");
    const { repository, rows } = makeRepository();
    const { blobStore, uploads } = makeBlobStore();
    const input = {
      blobStore,
      loadSource: async () => sourceBody,
      repository,
      source: {
        id: "22222222-2222-4222-8222-222222222222",
        mimeType: "image/png",
        updatedAt: NOW,
        url: `https://${HOST}/media/source.png`,
      },
    };

    await generateMediaDerivatives(input);
    const firstKeys = uploads.map((upload) => upload.objectKey);
    sourceBody = await fixture("#1b4965");
    await generateMediaDerivatives(input);
    const secondKeys = uploads.slice(firstKeys.length).map((upload) => upload.objectKey);

    expect(secondKeys).toHaveLength(MEDIA_DERIVATIVE_ROLES.length);
    expect(secondKeys.every((key) => !firstKeys.includes(key))).toBe(true);
    expect(rows).toHaveLength(MEDIA_DERIVATIVE_ROLES.length);
  });

  it("retains the previous ready derivative when replacement upload fails", async () => {
    let sourceBody = await fixture("#7a2f3b");
    const { repository, rows } = makeRepository();
    const { blobStore } = makeBlobStore();
    const source = {
      id: "33333333-3333-4333-8333-333333333333",
      mimeType: "image/png",
      updatedAt: NOW,
      url: `https://${HOST}/media/source.png`,
    };
    await generateMediaDerivatives({
      blobStore,
      loadSource: async () => sourceBody,
      repository,
      source,
    });
    const previousUrls = Array.from(rows.values()).map((row) => row.url);
    sourceBody = await fixture("#1b4965");
    const failingStore: DerivativeBlobStore = {
      async uploadImmutable() {
        throw new Error("token=must-not-leak");
      },
    };

    const result = await generateMediaDerivatives({
      blobStore: failingStore,
      loadSource: async () => sourceBody,
      repository,
      source,
    });

    expect(result.roles.every((role) => role.reason === "processing_failed")).toBe(true);
    expect(Array.from(rows.values()).every((row) => row.status === "ready")).toBe(true);
    expect(Array.from(rows.values()).map((row) => row.url)).toEqual(previousUrls);
    expect(JSON.stringify(Array.from(rows.values()))).not.toContain("token=");
  });

  it("enforces every role's hard byte and dimension budget", async () => {
    const sourceBody = await fixture("#7a2f3b");
    for (const role of MEDIA_DERIVATIVE_ROLES) {
      const output = await renderMediaDerivative(sourceBody, role);
      const budget = MEDIA_DERIVATIVE_BUDGETS[role];
      expect(output.body.byteLength).toBeLessThanOrEqual(budget.hardMaxBytes);
      expect(output.width).toBeGreaterThanOrEqual(budget.minWidth);
      expect(output.width).toBeLessThanOrEqual(budget.maxWidth);
      if (budget.targetHeight) expect(output.height).toBe(budget.targetHeight);
    }
  });

  it("reports unsupported source MIME and refuses to upscale undersized sources", async () => {
    const sourceBody = await fixture("#7a2f3b");
    const { repository } = makeRepository();
    const { blobStore } = makeBlobStore();
    await expect(
      generateMediaDerivatives({
        blobStore,
        loadSource: async () => sourceBody,
        repository,
        source: {
          id: "44444444-4444-4444-8444-444444444444",
          mimeType: "image/gif",
          updatedAt: NOW,
          url: `https://${HOST}/media/source.gif`,
        },
      }),
    ).rejects.toMatchObject({ code: "unsupported_source_mime" });

    const small = await sharp({
      create: { background: "#fff", channels: 3, height: 700, width: 500 },
    })
      .png()
      .toBuffer();
    await expect(renderMediaDerivative(small, "pdp")).rejects.toMatchObject({
      code: "source_too_small",
    });
  });
});
