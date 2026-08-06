import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicRoot = path.join(root, "public");
const runtimeRoots = ["app", "api", "components", "db", "lib"];
const compatibilityPaths = new Set([
  "banner/collection_banner.png",
  "Welcoming.webm",
  "welcome-poster.avif",
  "video/welcoming-v2.webm",
]);

const args = new Set(process.argv.slice(2));
if (args.has("--execute")) {
  throw new Error(
    "Deletion is intentionally unavailable. Produce and review a dry-run manifest first.",
  );
}

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(resolved) : [resolved];
    }),
  );
  return nested.flat();
};

const runtimeSource = async () => {
  const files = (
    await Promise.all(
      runtimeRoots.map(async (directory) => {
        const resolved = path.join(root, directory);
        try {
          return await walk(resolved);
        } catch {
          return [];
        }
      }),
    )
  )
    .flat()
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|mdx)$/.test(file));
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  return contents.join("\n");
};

async function main() {
  const [files, source] = await Promise.all([walk(publicRoot), runtimeSource()]);
  const assets = await Promise.all(
    files
      .filter((file) => path.basename(file) !== ".DS_Store")
      .map(async (file) => {
        const relativePath = path.relative(publicRoot, file).replaceAll(path.sep, "/");
        const bytes = (await stat(file)).size;
        const literalReference = source.includes(`/${relativePath}`);
        const compatibility = compatibilityPaths.has(relativePath);
        return {
          bytes,
          classification: literalReference
            ? "active-runtime-reference"
            : compatibility
              ? "compatibility-retain"
              : "candidate-pending-external-evidence",
          path: `public/${relativePath}`,
        };
      }),
  );
  const summary = assets.reduce(
    (result, asset) => {
      result.bytes += asset.bytes;
      result.count += 1;
      result.byClassification[asset.classification] ??= { bytes: 0, count: 0 };
      result.byClassification[asset.classification].bytes += asset.bytes;
      result.byClassification[asset.classification].count += 1;
      return result;
    },
    {
      bytes: 0,
      count: 0,
      byClassification: {} as Record<string, { bytes: number; count: number }>,
    },
  );
  const report = {
    assets,
    destructiveActionsAvailable: false,
    dryRun: true,
    evidenceLimitations: [
      "Literal source references do not prove external traffic or backlink absence.",
      "Blob inventory and deletion are intentionally out of scope.",
      "Candidates require CDN, referrer, Search Console and catalog evidence.",
    ],
    manifestHash: createHash("sha256")
      .update(JSON.stringify(assets))
      .digest("hex"),
    summary,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Cleanup report failed."}\n`,
  );
  process.exitCode = 1;
});
