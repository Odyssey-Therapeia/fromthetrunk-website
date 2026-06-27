import path from "path";

import { put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import sharp from "sharp";

import { createMediaRecord } from "@/db/queries/media";

/**
 * 1MB threshold: uploads at or above this size are auto-compressed to WebP
 * before the Blob record is persisted.
 */
const COMPRESS_THRESHOLD_BYTES = 1_024 * 1_024;
export const MAX_IMAGE_BYTES = 12 * 1_024 * 1_024;
export const MAX_IMAGE_PIXELS = 24_000_000;
const BLOB_FETCH_TIMEOUT_MS = 5_000;
const TRUSTED_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const TRUSTED_BLOB_PATH_PREFIX = "media/";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_EXTENSIONS_BY_MIME_TYPE: Record<string, string[]> = {
  "image/avif": [".avif"],
  "image/jpeg": [".jpeg", ".jpg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

type UploadUrlInput = {
  contentType: string;
  filename: string;
};

export type CreateMediaFromUploadInput = {
  /** Alt text is REQUIRED — uploads without alt are rejected. */
  alt: string;
  filename: string;
  mimeType: string;
  pathname: string;
  size: number;
  url: string;
};

export class MediaUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaUploadValidationError";
  }
}

const toSafeBasename = (filename: string) => {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "upload"}${ext.toLowerCase()}`;
};

const rejectMediaUpload = (message: string): never => {
  throw new MediaUploadValidationError(message);
};

const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "0.0.0.0") return true;

  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const normalizePathname = (pathname: string) =>
  decodeURIComponent(pathname).replace(/^\/+/, "");

const assertTrustedBlobUpload = (input: CreateMediaFromUploadInput): URL => {
  const url: URL = (() => {
    try {
      return new URL(input.url);
    } catch {
      return rejectMediaUpload("Invalid media URL.");
    }
  })();

  if (url.protocol !== "https:") {
    rejectMediaUpload("Media URL must use HTTPS.");
  }

  if (isPrivateOrLocalHostname(url.hostname)) {
    rejectMediaUpload("Media URL host is not allowed.");
  }

  if (!url.hostname.toLowerCase().endsWith(TRUSTED_BLOB_HOST_SUFFIX)) {
    rejectMediaUpload("Media URL must be a trusted Vercel Blob URL.");
  }

  const normalizedUrlPathname = normalizePathname(url.pathname);
  const normalizedInputPathname = normalizePathname(input.pathname);
  if (
    !normalizedInputPathname.startsWith(TRUSTED_BLOB_PATH_PREFIX) ||
    normalizedInputPathname.includes("..") ||
    normalizedUrlPathname !== normalizedInputPathname
  ) {
    rejectMediaUpload("Media pathname does not match the trusted upload path.");
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    rejectMediaUpload("Media content type is not allowed.");
  }

  if (input.size <= 0 || input.size > MAX_IMAGE_BYTES) {
    rejectMediaUpload("Media file is too large.");
  }

  const ext = path.extname(normalizedInputPathname).toLowerCase();
  const allowedExtensions = ALLOWED_EXTENSIONS_BY_MIME_TYPE[input.mimeType] ?? [];
  if (!allowedExtensions.includes(ext)) {
    rejectMediaUpload("Media extension does not match the content type.");
  }

  return url;
};

const getResponseHeader = (response: Response, header: string) =>
  response.headers.get(header) ?? response.headers.get(header.toLowerCase());

const assertFetchedBlobIsSafe = async (response: Response, rawBuffer: Buffer) => {
  const contentType = getResponseHeader(response, "content-type")?.split(";")[0]?.trim();
  if (contentType && !ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
    rejectMediaUpload("Fetched media content type is not allowed.");
  }

  const contentLength = getResponseHeader(response, "content-length");
  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    rejectMediaUpload("Fetched media file is too large.");
  }

  if (rawBuffer.byteLength > MAX_IMAGE_BYTES) {
    rejectMediaUpload("Fetched media file is too large.");
  }

  const metadata = await sharp(rawBuffer).metadata();
  const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  if (pixels > MAX_IMAGE_PIXELS) {
    rejectMediaUpload("Fetched media dimensions are too large.");
  }
};

export const generateUploadUrl = async (input: UploadUrlInput) => {
  const safeFilename = toSafeBasename(input.filename);
  const pathname = `media/${Date.now()}-${safeFilename}`;

  const clientToken = await generateClientTokenFromReadWriteToken({
    addRandomSuffix: false,
    allowedContentTypes: [input.contentType],
    pathname,
  });

  return {
    clientToken,
    pathname,
  };
};

/**
 * Creates a media record after enforcing:
 *  1. Alt text presence — rejects uploads with missing or blank alt.
 *  2. Auto-compression — images >=1MB are fetched from Blob, downscaled +
 *     re-encoded to WebP, and stored back to Blob before the record is persisted.
 *     The client PUT the file directly to Vercel Blob first; the server then
 *     fetches that Blob URL, runs sharp, and re-stores the WebP version.
 *     No raw buffer needs to be POSTed by the client.
 */
export const createMediaFromUpload = async (input: CreateMediaFromUploadInput) => {
  // ── 1. Alt enforcement ──────────────────────────────────────────────────
  if (!input.alt || input.alt.trim().length === 0) {
    throw new Error(
      "Alt text is required for accessibility. Provide a descriptive alt for every media upload."
    );
  }
  const trustedUrl = assertTrustedBlobUpload(input);

  // ── 2. Compression for large images ─────────────────────────────────────
  let finalUrl = input.url;
  let finalPathname = input.pathname;
  let finalMimeType = input.mimeType;
  let finalFilesize = input.size;
  let finalWidth: number | null = null;
  let finalHeight: number | null = null;

  if (input.size >= COMPRESS_THRESHOLD_BYTES) {
    // Fetch the just-uploaded original from Blob and compress server-side.
    const response = await fetch(trustedUrl, {
      signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch blob for compression: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    await assertFetchedBlobIsSafe(response, rawBuffer);

    const { data: compressedData, info } = await sharp(rawBuffer)
      .resize({ fit: "inside", withoutEnlargement: true, width: 2400 })
      .webp({ effort: 4, quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const safeBase = toSafeBasename(input.filename).replace(/\.[^.]+$/, "");
    const compressedPathname = `media/${Date.now()}-${safeBase}.webp`;

    const blob = await put(compressedPathname, compressedData, {
      access: "public",
      contentType: "image/webp",
    });

    finalUrl = blob.url;
    finalPathname = compressedPathname;
    finalMimeType = "image/webp";
    finalFilesize = info.size;
    finalWidth = info.width;
    finalHeight = info.height;
  }

  // ── 3. Persist media record ──────────────────────────────────────────────
  const record = await createMediaRecord({
    alt: input.alt,
    blurDataUrl: null,
    filename: input.filename,
    filesize: finalFilesize,
    height: finalHeight,
    key: finalPathname,
    metadata: {
      source: "vercel-blob",
    },
    mimeType: finalMimeType,
    url: finalUrl,
    width: finalWidth,
  });

  return record;
};
