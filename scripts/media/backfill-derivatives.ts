import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listProducts } from "@/db/queries/products";
import {
  generateMediaDerivatives,
  sanitizeDerivativeFailure,
  type MediaDerivativeGenerationResult,
} from "@/lib/media/derivative-generator";
import { vercelDerivativeBlobStore } from "@/lib/media/derivative-blob-store";
import { mediaDerivativeRepository } from "@/lib/media/derivative-runtime";
import { MEDIA_DERIVATIVE_ROLES } from "@/lib/media/derivative-policy";

type EnvironmentName = "local" | "production" | "staging";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...value] = argument.replace(/^--/, "").split("=");
    return [name, value.length > 0 ? value.join("=") : "true"];
  }),
);

const execute = args.get("execute") === "true";
const environment = (args.get("environment") ?? "local") as EnvironmentName;
const concurrency = Math.min(
  6,
  Math.max(1, Number.parseInt(args.get("concurrency") ?? "2", 10) || 2),
);
const productScope = args.get("product-id");
const mediaScope = args.get("media-id");
const reportDirectory = args.get("report-dir");

const fingerprint = (value: string | undefined): string | null =>
  value
    ? createHash("sha256").update(value).digest("hex").slice(0, 12)
    : null;

const buildEnvironmentEvidence = () => ({
  blobStoreFingerprint: fingerprint(process.env.FTT_MEDIA_BLOB_STORE_ID),
  databaseFingerprint: fingerprint(process.env.FTT_MEDIA_DATABASE_ID),
  derivativeDestinationHost:
    process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST?.trim().toLowerCase() ??
    null,
  environmentBinding: process.env.FTT_MEDIA_EXECUTION_ENVIRONMENT ?? null,
});

const assertExecutionConfirmation = () => {
  const evidence = buildEnvironmentEvidence();
  if (!execute) return evidence;
  if (!(["local", "staging", "production"] as string[]).includes(environment)) {
    throw new Error("--environment must be local, staging, or production.");
  }
  if (args.get("confirm-environment") !== environment) {
    throw new Error("Execution requires --confirm-environment=<environment>.");
  }
  if (evidence.environmentBinding !== environment) {
    throw new Error(
      "FTT_MEDIA_EXECUTION_ENVIRONMENT must exactly match --environment.",
    );
  }
  if (!evidence.databaseFingerprint || !evidence.blobStoreFingerprint) {
    throw new Error(
      "Execution requires FTT_MEDIA_DATABASE_ID and FTT_MEDIA_BLOB_STORE_ID.",
    );
  }
  if (
    args.get("confirm-database-fingerprint") !== evidence.databaseFingerprint ||
    args.get("confirm-blob-store-fingerprint") !== evidence.blobStoreFingerprint
  ) {
    throw new Error(
      "Execution confirmations must match the sanitized database and Blob store fingerprints.",
    );
  }
  if (
    !process.env.FTT_MEDIA_DERIVATIVE_BLOB_TOKEN ||
    !evidence.derivativeDestinationHost
  ) {
    throw new Error(
      "Execution requires a dedicated derivative token and exact destination host.",
    );
  }
  if (args.get("confirm-write") !== "GENERATE_IMMUTABLE_DERIVATIVES") {
    throw new Error(
      "Execution requires --confirm-write=GENERATE_IMMUTABLE_DERIVATIVES.",
    );
  }
  if (
    environment === "production" &&
    args.get("confirm-production") !== "I_UNDERSTAND_PRODUCTION_MEDIA_WRITES"
  ) {
    throw new Error(
      "Production additionally requires --confirm-production=I_UNDERSTAND_PRODUCTION_MEDIA_WRITES.",
    );
  }
  if (environment === "production" && concurrency !== 1) {
    throw new Error(
      "Production backfill requires --concurrency=1 to bound legacy-image memory usage.",
    );
  }
  if (process.env.FTT_MEDIA_DERIVATIVES_ACTIVE === "1") {
    throw new Error("Backfill refuses to run while derivative consumption is active.");
  }
  if (environment === "staging") {
    const productionDatabase = fingerprint(process.env.FTT_PRODUCTION_DATABASE_ID);
    const productionBlobStore = fingerprint(process.env.FTT_PRODUCTION_BLOB_STORE_ID);
    const productionBlobHost =
      process.env.FTT_PRODUCTION_BLOB_HOST?.trim().toLowerCase();
    if (!productionDatabase || !productionBlobStore || !productionBlobHost) {
      throw new Error(
        "Staging execution requires protected production database and Blob identity references for inequality checks.",
      );
    }
    if (
      productionDatabase === evidence.databaseFingerprint ||
      productionBlobStore === evidence.blobStoreFingerprint ||
      productionBlobHost === evidence.derivativeDestinationHost
    ) {
      throw new Error("Staging resources must differ from every production identity.");
    }
  }
  return evidence;
};

const listAllPublishedProducts = async () => {
  const pageSize = 250;
  const products: Awaited<ReturnType<typeof listProducts>>["rows"] = [];
  let expectedTotal: number | null = null;

  for (let offset = 0; ; offset += pageSize) {
    const page = await listProducts({
      includeDrafts: false,
      limit: pageSize,
      offset,
    });
    expectedTotal ??= page.totalCount;
    products.push(...page.rows);
    if (products.length >= page.totalCount || page.rows.length === 0) break;
  }

  if (expectedTotal === null || products.length !== expectedTotal) {
    throw new Error("Published product pagination was incomplete; refusing backfill.");
  }
  return products;
};

const withRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  throw lastError;
};

const mapConcurrent = async <T, R>(
  values: T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const environmentEvidence = assertExecutionConfirmation();
  if (execute) {
    process.stderr.write(
      `Verified write preflight: ${JSON.stringify(environmentEvidence)}\n`,
    );
  }
  const products = await listAllPublishedProducts();
  const scopedProducts = productScope
    ? products.filter((product) => product.id === productScope)
    : products;
  const mediaById = new Map(
    scopedProducts
      .flatMap((product) =>
        product.images.map((image) => ({ media: image.media, product })),
      )
      .filter(({ media }) => !mediaScope || media.id === mediaScope)
      .map(({ media, product }) => [media.id, { media, productSlugs: [product.slug] }]),
  );
  for (const product of scopedProducts) {
    for (const image of product.images) {
      const current = mediaById.get(image.media.id);
      if (current && !current.productSlugs.includes(product.slug)) {
        current.productSlugs.push(product.slug);
      }
    }
  }
  const work = Array.from(mediaById.values());
  const failures: Array<{
    mediaAssetId: string;
    productSlugs: string[];
    reason: string;
  }> = [];
  let results: MediaDerivativeGenerationResult[] = [];

  if (execute) {
    results = await mapConcurrent(work, concurrency, async ({ media, productSlugs }, index) => {
      process.stderr.write(`Processing media ${index + 1}/${work.length}: ${media.id}\n`);
      try {
        return await withRetry(() =>
          generateMediaDerivatives({
            blobStore: vercelDerivativeBlobStore,
            repository: mediaDerivativeRepository,
            source: {
              id: media.id,
              mimeType: media.mimeType,
              updatedAt: media.updatedAt,
              url: media.url,
            },
            sourceMode: "legacy_backfill",
          }),
        );
      } catch (error) {
        failures.push({
          mediaAssetId: media.id,
          productSlugs,
          reason: sanitizeDerivativeFailure(error),
        });
        return {
          mediaAssetId: media.id,
          roles: MEDIA_DERIVATIVE_ROLES.map((role) => ({
            byteSize: 0,
            reason: sanitizeDerivativeFailure(error),
            role,
            status: "failed" as const,
          })),
          sourceBytes: 0,
          sourceHash: "",
        };
      }
    });
  }

  const roleCounts = Object.fromEntries(
    MEDIA_DERIVATIVE_ROLES.map((role) => {
      const roleResults = results.flatMap((result) =>
        result.roles.filter((candidate) => candidate.role === role),
      );
      return [
        role,
        {
          failed: roleResults.filter((result) => result.status === "failed").length,
          generated: roleResults.filter((result) => result.status === "generated").length,
          planned: execute ? 0 : work.length,
          skipped: roleResults.filter((result) => result.status === "skipped").length,
        },
      ];
    }),
  );
  const totalSourceBytesRead = results.reduce(
    (total, result) => total + result.sourceBytes,
    0,
  );
  const totalDerivativeBytesProduced = results.reduce(
    (total, result) =>
      total +
      result.roles
        .filter((role) => role.status === "generated")
        .reduce((sum, role) => sum + role.byteSize, 0),
    0,
  );
  const report = {
    concurrency,
    dryRun: !execute,
    environment,
    environmentEvidence,
    estimatedReductionBytes:
      execute ? totalSourceBytesRead - totalDerivativeBytesProduced : null,
    failedAssets: failures.length,
    failures,
    mediaAssets: work.length,
    productScope: productScope ?? null,
    publishedProducts: scopedProducts.length,
    roleCounts,
    totalDerivativeBytesProduced,
    totalSourceBytesKnown: work.reduce(
      (total, item) => total + (item.media.filesize ?? 0),
      0,
    ),
    totalSourceBytesRead,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (reportDirectory) {
    const safeDirectory = path.resolve(reportDirectory);
    await mkdir(safeDirectory, { recursive: true });
    await writeFile(
      path.join(safeDirectory, "media-derivative-backfill.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    const csv = [
      "mediaAssetId,productSlugs,reason",
      ...failures.map((failure) =>
        [
          failure.mediaAssetId,
          failure.productSlugs.join("|"),
          failure.reason,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
    await writeFile(
      path.join(safeDirectory, "media-derivative-failures.csv"),
      `${csv}\n`,
      "utf8",
    );
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Backfill failed."}\n`,
  );
  process.exitCode = 1;
});
