import { count } from "drizzle-orm";
import { head } from "@vercel/blob";

import { db, withRetry } from "@/db";
import { listAllMediaDerivatives } from "@/db/queries/media-derivatives";
import { listProducts } from "@/db/queries/products";
import { mediaAssets } from "@/db/schema";
import { buildMediaDerivativeCoverageReport } from "@/lib/media/derivative-coverage";
import { isApprovedDerivativeDestinationUrl } from "@/lib/media/derivative-policy";

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
    throw new Error("Published product pagination was incomplete.");
  }
  return products;
};

const verifyReadyBlobObjects = async (
  derivatives: Awaited<ReturnType<typeof listAllMediaDerivatives>>,
) => {
  const ready = derivatives.filter((row) => row.status === "ready");
  if (ready.length === 0) return { checked: 0, failures: [] as object[] };
  const token = process.env.FTT_MEDIA_DERIVATIVE_BLOB_TOKEN;
  if (!token || !process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST) {
    return {
      checked: 0,
      failures: [{ reason: "missing_destination_configuration" }],
    };
  }

  const failures: Array<{
    mediaAssetId: string;
    reason: string;
    role: string;
  }> = [];
  for (let index = 0; index < ready.length; index += 4) {
    await Promise.all(
      ready.slice(index, index + 4).map(async (row) => {
        try {
          if (!row.url || !isApprovedDerivativeDestinationUrl(row.url)) {
            throw new Error("unsafe_destination");
          }
          const metadata = await head(row.url, { token });
          if (
            metadata.pathname !== row.objectKey ||
            metadata.size !== row.byteSize ||
            metadata.contentType !== row.mimeType ||
            !isApprovedDerivativeDestinationUrl(metadata.url)
          ) {
            throw new Error("metadata_mismatch");
          }
        } catch {
          failures.push({
            mediaAssetId: row.mediaAssetId,
            reason: "blob_head_or_metadata_verification_failed",
            role: row.role,
          });
        }
      }),
    );
  }
  return { checked: ready.length, failures };
};

async function main() {
  const [products, derivatives, [mediaCount]] = await Promise.all([
    listAllPublishedProducts(),
    listAllMediaDerivatives(),
    withRetry(() => db.select({ total: count() }).from(mediaAssets)),
  ]);
  const report = buildMediaDerivativeCoverageReport({
    derivatives,
    products,
    totalMediaAssets: mediaCount?.total ?? 0,
  });
  const blobVerification = await verifyReadyBlobObjects(derivatives);
  const finalReport = {
    ...report,
    blobVerification,
    releaseAllowed:
      report.releaseAllowed && blobVerification.failures.length === 0,
  };
  process.stdout.write(`${JSON.stringify(finalReport, null, 2)}\n`);
  if (!finalReport.releaseAllowed) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Derivative release gate could not run. Apply the additive staging migration first. ${message}\n`,
  );
  process.exitCode = 1;
});
