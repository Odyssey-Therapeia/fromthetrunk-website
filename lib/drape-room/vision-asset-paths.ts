import manifest from "@/public/drape-room/vision/mediapipe-1.0.1/manifest.json";

/**
 * `/drape-room/vision/` is a RESERVED static namespace.
 *
 * The proxy treats `/drape-room/` as a public-asset prefix and passes it
 * straight through, so a request for a file that is not on disk is not served
 * by the static handler and instead falls into the CMS catch-all
 * (`app/(site)/[...slug]/page.tsx`). That route streams an app shell, which
 * locks the HTTP status at 200 before its `notFound()` can take effect — the
 * same failure the product/CMS 404 preflights in proxy.ts already exist to
 * prevent. The result is a ~136 KB HTML page returned as 200 for a missing
 * `.wasm` or `.task`, which makes "the asset returns 200" worthless as a
 * deployment check and hands MediaPipe HTML where it expects a binary.
 *
 * Because middleware runs at the edge it cannot stat the filesystem, so the
 * namespace is enumerated from the same manifest the prepare/verify script
 * checks. Anything inside the namespace that is not a manifest-listed asset is
 * a hard 404. Adding an asset means adding it to the manifest, which the build
 * gate (`pnpm run drape:vision:verify`) already requires.
 */
export const DRAPE_VISION_NAMESPACE = "/drape-room/vision/";

const VERSIONED_ROOT = `${DRAPE_VISION_NAMESPACE}mediapipe-${manifest.packageVersion}`;

export const DRAPE_VISION_ASSET_PATHS: ReadonlySet<string> = new Set([
  `${VERSIONED_ROOT}/manifest.json`,
  ...manifest.runtime.map((entry) => `${VERSIONED_ROOT}/${entry.file}`),
  ...manifest.models.map((entry) => `${VERSIONED_ROOT}/${entry.file}`),
]);

/** True for any path inside the reserved namespace, real or not. */
export const isReservedVisionPath = (pathname: string): boolean =>
  pathname.startsWith(DRAPE_VISION_NAMESPACE);

/** True only for a path the manifest actually declares. */
export const isKnownVisionAssetPath = (pathname: string): boolean =>
  DRAPE_VISION_ASSET_PATHS.has(pathname);
