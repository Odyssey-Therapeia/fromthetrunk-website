/**
 * Read-only diagnosis of why a saree's Drape Room generation is unavailable.
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local \
 *     scripts/drape-room/diagnose-reference.ts <product-slug-or-name>
 *
 * SELECT statements only. Prints the projection reason and, for each gallery
 * image, which reference check it failed.
 */
import { db } from "@/db";
import { products } from "@/db/schema";
import { ilike, or } from "drizzle-orm";

import {
  projectDrapeSaree,
  resolveDrapeProductReferences,
} from "@/lib/drape-room/product";
import { resolveCurrentProductImage } from "@/lib/media/product-image-resolver";

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Pass a product slug or part of its name.");
    process.exit(1);
  }

  const rows = await db.query.products.findMany({
    where: or(ilike(products.name, `%${query}%`), ilike(products.slug, `%${query}%`)),
    with: {
      images: { with: { media: { with: { derivatives: true } } } },
      collections: true,
    },
    limit: 3,
  });

  if (rows.length === 0) {
    console.error(`No product matched "${query}".`);
    process.exit(1);
  }

  for (const product of rows) {
    console.log(`\n=== ${product.name} (${product.slug}) ===`);
    console.log(`status=${product.status} images=${product.images.length}`);

    const projection = projectDrapeSaree(product as never);
    console.log(
      projection.eligible
        ? "projectDrapeSaree: ELIGIBLE — generation should be available"
        : `projectDrapeSaree: NOT ELIGIBLE — reason=${projection.reason}`,
    );

    const references = resolveDrapeProductReferences(product as never);
    console.log(
      references
        ? `references: ${references.mode} (${references.references.length})`
        : "references: none resolved",
    );

    for (const relation of [...product.images].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    )) {
      const current = resolveCurrentProductImage(relation as never, "pdp").image;
      const derivativeRoles = (relation.media.derivatives ?? [])
        .map((derivative) => derivative.role)
        .join(",");
      console.log(
        [
          `  #${relation.sortOrder}`,
          `media=${relation.media.id.slice(0, 8)}`,
          `mime=${current?.mimeType ?? "?"}`,
          `size=${current?.width ?? "?"}x${current?.height ?? "?"}`,
          `bytes=${current?.filesize ?? "?"}`,
          `derivatives=[${derivativeRoles || "none"}]`,
          `url=${current?.url?.slice(0, 70) ?? "?"}`,
        ].join(" "),
      );
    }
  }

  process.exit(0);

}

void main();
