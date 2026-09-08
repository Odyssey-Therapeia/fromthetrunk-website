/**
 * Read-only diagnosis of why a saree's Drape Room generation is unavailable.
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local \
 *     scripts/drape-room/diagnose-reference.ts <product-slug>
 *   pnpm exec tsx --env-file-if-exists=.env.local \
 *     scripts/drape-room/diagnose-reference.ts --all
 *
 * SELECT statements only. Per product it prints the projection reason and the
 * values each gallery image is checked against; `--all` counts the catalogue
 * by reason, which is the before/after check for a derivative rollout.
 */
import { getProductBySlug, listProducts } from "@/db/queries/products";
import {
  projectDrapeSaree,
  resolveDrapeProductReferences,
} from "@/lib/drape-room/product";
import { resolveCurrentProductImage } from "@/lib/media/product-image-resolver";

async function scanCatalogue() {
  const { rows } = await listProducts({ limit: 500 });
  const byReason = new Map<string, string[]>();

  for (const product of rows) {
    const projection = projectDrapeSaree(product);
    const reason = projection.eligible ? "drapeable" : projection.reason;
    byReason.set(reason, [...(byReason.get(reason) ?? []), product.slug]);
  }

  console.log(`scanned ${rows.length} published products\n`);
  for (const [reason, slugs] of [...byReason].sort(
    (left, right) => right[1].length - left[1].length,
  )) {
    console.log(`${reason}: ${slugs.length}`);
    if (reason !== "drapeable") {
      for (const slug of slugs) console.log(`  ${slug}`);
    }
  }
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Pass a product slug, or --all for a catalogue summary.");
    process.exit(1);
  }
  if (slug === "--all") {
    await scanCatalogue();
    process.exit(0);
  }

  const product = await getProductBySlug(slug, { includeDrafts: true });
  if (!product) {
    console.error(`No product matched slug "${slug}".`);
    process.exit(1);
  }

  console.log(`=== ${product.name} (${product.slug}) ===`);
  console.log(`status=${product.status} images=${product.images.length}`);

  const projection = projectDrapeSaree(product);
  console.log(
    projection.eligible
      ? "projectDrapeSaree: ELIGIBLE — generation should be available"
      : `projectDrapeSaree: NOT ELIGIBLE — reason=${projection.reason}`,
  );

  const references = resolveDrapeProductReferences(product);
  console.log(
    references
      ? `references: ${references.mode}, ${references.references.length} usable`
      : "references: none resolved",
  );

  for (const relation of [...product.images].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const current = resolveCurrentProductImage(relation, "pdp").image;
    const derivativeRoles = (relation.media.derivatives ?? [])
      .map((derivative) => `${derivative.role}:${derivative.status ?? "?"}`)
      .join(",");
    console.log(
      [
        `  #${relation.sortOrder}`,
        `mime=${current?.mimeType ?? "?"}`,
        `px=${current?.width ?? "?"}x${current?.height ?? "?"}`,
        `bytes=${current?.filesize ?? "?"}`,
        `derivatives=[${derivativeRoles || "none"}]`,
        `url=${current?.url?.slice(0, 60) ?? "?"}`,
      ].join(" "),
    );
  }

  process.exit(0);
}

void main();
