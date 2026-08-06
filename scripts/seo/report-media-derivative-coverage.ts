import { listProducts } from "@/db/queries/products";
import { resolveBoundedSeoImage } from "@/lib/media/media-derivatives";

async function main() {
  const { rows } = await listProducts({
    includeDrafts: false,
    limit: 1_000,
    offset: 0,
  });

  const products = rows.map((product) => {
    const primary = [...product.images].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    )[0];
    const resolution = resolveBoundedSeoImage(primary?.media);
    return {
      productSlug: product.slug,
      primaryMediaId: product.images[0]?.media.id ?? null,
      ready: Boolean(resolution.image),
      reason: resolution.reason,
    };
  });

  const reasons = products.reduce<Record<string, number>>((counts, product) => {
    const key = product.reason ?? "ready";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalProducts: products.length,
        readyProducts: products.filter((product) => product.ready).length,
        reasons,
        needsBackfill: products.filter((product) => !product.ready),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
