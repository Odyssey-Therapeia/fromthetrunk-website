#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3000";
const PRODUCTION_HOSTS = new Set([
  "fromthetrunk.com",
  "www.fromthetrunk.com",
  "fromthetrunk.shop",
  "www.fromthetrunk.shop",
]);

const criticalPaths = [
  "/",
  "/collection",
  "/hero/3-lcp.webp",
  "/hero/mobile_1-lcp.webp",
  "/banner/collection_banner-mobile.webp",
];

function parseArgs(argv) {
  const args = new Map();

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--yes-production") {
      args.set("yesProduction", "true");
      continue;
    }

    if (current === "--base-url" && argv[index + 1]) {
      args.set("baseUrl", argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function assertAllowedBaseUrl(baseUrl, allowProduction) {
  const url = new URL(baseUrl);
  const hostname = url.hostname.toLowerCase();

  if (PRODUCTION_HOSTS.has(hostname) && !allowProduction) {
    throw new Error(
      "Refusing to warm production. Pass --yes-production only during an approved release warmup.",
    );
  }

  return url;
}

async function warmUrl(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: {
      "user-agent": "ftt-critical-image-warmup/1.0",
    },
    redirect: "follow",
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const cache = response.headers.get("x-vercel-cache") ?? "n/a";
  const contentType = response.headers.get("content-type") ?? "n/a";

  return {
    cache,
    contentType,
    durationMs,
    ok: response.ok,
    pathname,
    status: response.status,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl =
    args.get("baseUrl") ?? process.env.FTT_WARM_BASE_URL ?? DEFAULT_BASE_URL;
  const allowProduction =
    args.get("yesProduction") === "true" ||
    process.env.FTT_ALLOW_PRODUCTION_WARMUP === "true";
  const parsedBaseUrl = assertAllowedBaseUrl(baseUrl, allowProduction);

  console.log(`Warming critical public assets from ${parsedBaseUrl.origin}`);

  let failures = 0;

  for (const pathname of criticalPaths) {
    try {
      const result = await warmUrl(parsedBaseUrl, pathname);

      if (!result.ok) failures += 1;

      console.log(
        `${result.ok ? "OK" : "FAIL"} ${result.status} ${result.pathname} ${result.durationMs}ms cache=${result.cache} type=${result.contentType}`,
      );
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${pathname} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
