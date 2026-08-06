/**
 * Read-only current product-media measurement.
 *
 * Reads only published product relationships and public source headers. It does
 * not mutate Postgres or Blob storage. GET bodies are capped at 512 KiB and are
 * used only to parse intrinsic image dimensions missing from legacy records.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { rawSql } from "@/db";

type Row = {
  filesize: number | null;
  height: number | null;
  media_id: string;
  metadata: Record<string, unknown> | null;
  mime_type: string | null;
  product_id: string;
  product_slug: string;
  sort_order: number;
  url: string;
  width: number | null;
};

type Measurement = {
  byteSize: number | null;
  height: number | null;
  host: string | null;
  mediaId: string;
  mimeType: string | null;
  path: string | null;
  productSlugs: string[];
  query: string | null;
  source: "database" | "head" | "range";
  url: string;
  width: number | null;
};

const MAX_HEADER_BYTES = 512 * 1024;
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

const positiveInteger = (value: number | null | undefined) =>
  Number.isInteger(value) && (value ?? 0) > 0 ? value! : null;

const normalizeMime = (value: string | null | undefined) =>
  value?.split(";", 1)[0]?.trim().toLowerCase() || null;

const jpegDimensions = (bytes: Uint8Array) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) return null;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += segmentLength;
  }
  return null;
};

const pngDimensions = (bytes: Uint8Array) => {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const webpDimensions = (bytes: Uint8Array) => {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits =
      bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
};

const imageDimensions = (bytes: Uint8Array) =>
  jpegDimensions(bytes) ?? pngDimensions(bytes) ?? webpDimensions(bytes);

async function readBoundedHeader(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${MAX_HEADER_BYTES - 1}` },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`range ${response.status}`);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HEADER_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_HEADER_BYTES - total;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.length;
  }
  await reader.cancel();
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function measure(row: Row, productSlugs: string[]): Promise<Measurement> {
  let parsed: URL | null = null;
  try {
    parsed = new URL(row.url);
  } catch {
    // Invalid URLs remain explicit in the report.
  }
  let byteSize = positiveInteger(row.filesize);
  let width = positiveInteger(row.width);
  let height = positiveInteger(row.height);
  let mimeType = normalizeMime(row.mime_type);
  let source: Measurement["source"] = "database";

  if (parsed) {
    try {
      const head = await fetch(row.url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (head.ok) {
        const contentLength = Number.parseInt(head.headers.get("content-length") ?? "", 10);
        if (Number.isInteger(contentLength) && contentLength > 0) byteSize = contentLength;
        mimeType = normalizeMime(head.headers.get("content-type")) ?? mimeType;
        source = "head";
      }
    } catch {
      // Preserve database metadata and continue with the bounded dimension read.
    }
    if (!width || !height) {
      try {
        const dimensions = imageDimensions(await readBoundedHeader(row.url));
        if (dimensions) {
          width = dimensions.width;
          height = dimensions.height;
          source = "range";
        }
      } catch {
        // Missing measurements are fail-closed by the runtime resolver.
      }
    }
  }

  return {
    byteSize,
    height,
    host: parsed?.hostname.toLowerCase() ?? null,
    mediaId: row.media_id,
    mimeType,
    path: parsed?.pathname ?? null,
    productSlugs,
    query: parsed?.search || null,
    source,
    url: row.url,
    width,
  };
}

async function main() {
  const rows = (await rawSql`
    select
      ma.filesize,
      ma.height,
      ma.id::text as media_id,
      ma.metadata,
      ma.mime_type,
      p.id::text as product_id,
      p.slug as product_slug,
      pi.sort_order,
      ma.url,
      ma.width
    from products p
    join product_images pi on pi.product_id = p.id
    join media_assets ma on ma.id = pi.media_id
    where p.status = 'published'
    order by p.slug, pi.sort_order, ma.id
  `) as Row[];

  const uniqueRows = new Map<string, Row>();
  const slugsByMedia = new Map<string, Set<string>>();
  for (const row of rows) {
    uniqueRows.set(row.media_id, row);
    const slugs = slugsByMedia.get(row.media_id) ?? new Set<string>();
    slugs.add(row.product_slug);
    slugsByMedia.set(row.media_id, slugs);
  }

  const pending = [...uniqueRows.values()];
  const measurements: Measurement[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++]!;
        measurements.push(
          await measure(row, [...(slugsByMedia.get(row.media_id) ?? [])].sort()),
        );
      }
    }),
  );
  measurements.sort((a, b) => a.url.localeCompare(b.url));

  const byUrl = Object.fromEntries(
    measurements.map((item) => [
      item.url,
      {
        byteSize: item.byteSize,
        height: item.height,
        mimeType: item.mimeType,
        width: item.width,
      },
    ]),
  );
  const generated = `/** Generated by scripts/seo/measure-current-product-media.ts. */\nexport type CurrentProductMediaMeasurement = {\n  byteSize: number | null;\n  height: number | null;\n  mimeType: string | null;\n  width: number | null;\n};\n\nexport const CURRENT_PRODUCT_MEDIA_MEASUREMENTS: Readonly<Record<string, CurrentProductMediaMeasurement>> = ${JSON.stringify(byUrl, null, 2)};\n\nexport const getCurrentProductMediaMeasurement = (url: string) =>\n  CURRENT_PRODUCT_MEDIA_MEASUREMENTS[url];\n`;

  const outputDirectory = path.resolve("test-results/pre-vercel");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "current-product-media-measurements.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), relationships: rows.length, measurements }, null, 2)}\n`,
  );
  await writeFile(
    path.resolve("lib/media/current-product-media-measurements.generated.ts"),
    generated,
  );

  const measured = measurements.filter(
    (item) => item.byteSize && item.width && item.height && item.mimeType,
  );
  process.stdout.write(
    `${JSON.stringify({ relationships: rows.length, uniqueMedia: measurements.length, fullyMeasured: measured.length, missingMeasurement: measurements.length - measured.length }, null, 2)}\n`,
  );
}

void main();
