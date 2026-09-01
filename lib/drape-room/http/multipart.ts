import { isTryonIdempotencyKey } from "@/lib/drape-room/security/identities";
import { z } from "zod";

export const TRYON_BACKGROUNDS = [
  "studio",
  "festival",
  "wedding",
  "party",
  "birthday",
] as const;
export type TryonBackground = (typeof TRYON_BACKGROUNDS)[number];

const MAX_MULTIPART_BYTES = 3_500_000;
const MAX_PHOTO_BYTES = 2_000_000;
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MULTIPART_SCALAR_SCHEMA = z
  .object({
    background: z.enum(TRYON_BACKGROUNDS),
    idempotencyKey: z.string().regex(PRODUCT_ID_PATTERN),
    productId: z.string().regex(PRODUCT_ID_PATTERN),
    regeneration: z.literal("true").optional(),
  })
  .strict();
const ALLOWED_FIELDS = new Set([
  "photo",
  "productId",
  "background",
  "idempotencyKey",
  "regeneration",
]);

export type ParsedTryonMultipart = {
  photo: Uint8Array;
  photoMimeType: "image/jpeg";
  productId: string;
  background: TryonBackground;
  idempotencyKey: string;
  regeneration: boolean;
};

export type TryonMultipartErrorCode =
  | "TRYON_INVALID_CONTENT_TYPE"
  | "TRYON_REQUEST_TOO_LARGE"
  | "TRYON_INVALID_FIELDS"
  | "TRYON_INVALID_PHOTO"
  | "TRYON_INVALID_PRODUCT"
  | "TRYON_INVALID_BACKGROUND"
  | "TRYON_INVALID_IDEMPOTENCY_KEY";

export class TryonMultipartError extends Error {
  constructor(
    readonly code: TryonMultipartErrorCode,
    readonly status: 400 | 413 | 415,
  ) {
    super(code);
    this.name = "TryonMultipartError";
  }
}

export async function parseTryonMultipart(
  request: Request,
  signal: AbortSignal = request.signal,
): Promise<ParsedTryonMultipart> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
    throw new TryonMultipartError("TRYON_INVALID_CONTENT_TYPE", 415);
  }
  const advertised = Number(request.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > MAX_MULTIPART_BYTES) {
    throw new TryonMultipartError("TRYON_REQUEST_TOO_LARGE", 413);
  }

  const body = await readBoundedRequest(request, MAX_MULTIPART_BYTES, signal);
  const parseBody = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
  try {
    const parseRequest = new Request("http://local.invalid/", {
      method: "POST",
      headers: { "content-type": contentType },
      body: parseBody,
    });
    let form: FormData;
    try {
      form = await parseRequest.formData();
    } catch {
      throw new TryonMultipartError("TRYON_INVALID_FIELDS", 400);
    }

    const values = new Map<string, FormDataEntryValue>();
    for (const [key, value] of form.entries()) {
      if (!ALLOWED_FIELDS.has(key) || values.has(key)) {
        throw new TryonMultipartError("TRYON_INVALID_FIELDS", 400);
      }
      values.set(key, value);
    }
    for (const required of [
      "photo",
      "productId",
      "background",
      "idempotencyKey",
    ]) {
      if (!values.has(required)) {
        throw new TryonMultipartError("TRYON_INVALID_FIELDS", 400);
      }
    }

    const photo = values.get("photo");
    if (
      !(photo instanceof File) ||
      photo.type !== "image/jpeg" ||
      photo.size <= 0 ||
      photo.size > MAX_PHOTO_BYTES
    ) {
      throw new TryonMultipartError(
        "TRYON_INVALID_PHOTO",
        photo instanceof File && photo.size > MAX_PHOTO_BYTES ? 413 : 400,
      );
    }
    const scalarResult = MULTIPART_SCALAR_SCHEMA.safeParse({
      background: stringField(values.get("background")),
      idempotencyKey: stringField(values.get("idempotencyKey")),
      productId: stringField(values.get("productId")),
      regeneration:
        values.get("regeneration") === undefined
          ? undefined
          : stringField(values.get("regeneration")),
    });
    if (!scalarResult.success) {
      const productId = stringField(values.get("productId"));
      const background = stringField(values.get("background"));
      const idempotencyKey = stringField(values.get("idempotencyKey"));
      if (!PRODUCT_ID_PATTERN.test(productId)) {
        throw new TryonMultipartError("TRYON_INVALID_PRODUCT", 400);
      }
      if (!TRYON_BACKGROUNDS.includes(background as TryonBackground)) {
        throw new TryonMultipartError("TRYON_INVALID_BACKGROUND", 400);
      }
      if (!isTryonIdempotencyKey(idempotencyKey)) {
        throw new TryonMultipartError("TRYON_INVALID_IDEMPOTENCY_KEY", 400);
      }
      throw new TryonMultipartError("TRYON_INVALID_FIELDS", 400);
    }
    const {
      background,
      idempotencyKey,
      productId,
      regeneration: regenerationValue,
    } = scalarResult.data;
    if (!isTryonIdempotencyKey(idempotencyKey)) {
      throw new TryonMultipartError("TRYON_INVALID_IDEMPOTENCY_KEY", 400);
    }
    if (!productId || !PRODUCT_ID_PATTERN.test(productId)) {
      throw new TryonMultipartError("TRYON_INVALID_PRODUCT", 400);
    }

    return {
      background,
      idempotencyKey,
      photo: new Uint8Array(await photo.arrayBuffer()),
      photoMimeType: "image/jpeg",
      productId,
      regeneration: regenerationValue === "true",
    };
  } finally {
    body.fill(0);
    try {
      new Uint8Array(parseBody).fill(0);
    } catch {
      // The Request implementation may already have detached its body buffer.
    }
  }
}

function stringField(value: FormDataEntryValue | undefined): string {
  return typeof value === "string" ? value : "";
}

async function readBoundedRequest(
  request: Request,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!request.body) throw new TryonMultipartError("TRYON_INVALID_FIELDS", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelForAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  if (signal.aborted) cancelForAbort();
  else signal.addEventListener("abort", cancelForAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signal.reason ?? new Error("request_aborted");
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new TryonMultipartError("TRYON_REQUEST_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancelForAbort);
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}
