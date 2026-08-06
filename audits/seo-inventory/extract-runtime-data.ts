import fs from "node:fs/promises";
import path from "node:path";

import {
  dbSelectAllPages,
  dbSelectAllRedirects,
  dbSelectMenu,
} from "@/db/queries/content";

async function main() {
  const root = process.cwd();
  const outputPath = path.join(
    root,
    "audits",
    "seo-inventory",
    "runtime-source-data.json",
  );

  const [pages, redirects, headerMenu, footerMenu] = await Promise.all([
    dbSelectAllPages(),
    dbSelectAllRedirects(),
    dbSelectMenu("header"),
    dbSelectMenu("footer"),
  ]);

  const output = {
    generatedAt: new Date().toISOString(),
    source: "Configured local Drizzle/Neon data source, queried read-only",
    pages: pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      status: page.status,
      hasPublishedVersion: Boolean(page.publishedVersionId),
      seo: page.seo,
      updatedAt: page.updatedAt,
    })),
    redirects: redirects.map((redirect) => ({
      fromPath: redirect.fromPath,
      toPath: redirect.toPath,
      createdAt: redirect.createdAt,
    })),
    menus: {
      header: headerMenu?.items ?? null,
      footer: footerMenu?.items ?? null,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify({
      outputPath,
      pages: output.pages.length,
      redirects: output.redirects.length,
      headerMenuPresent: Boolean(headerMenu),
      footerMenuPresent: Boolean(footerMenu),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
