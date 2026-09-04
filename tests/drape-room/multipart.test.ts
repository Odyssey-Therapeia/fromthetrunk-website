import { describe, expect, it } from "vitest";

import {
  TryonMultipartError,
  parseTryonMultipart,
} from "@/lib/drape-room/http/multipart";

/**
 * Transport bounds for the paid Drape Room request.
 *
 * The field allowlist is exercised through the route suite, but the SIZE and
 * CONTENT-TYPE bounds — the ones that stop an oversized or non-multipart body
 * from ever reaching Sharp, the ledger, or the provider — had no coverage at
 * all. They are the first thing a hostile or buggy client hits, so they are
 * pinned here directly against the parser.
 */

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";

const MAX_MULTIPART_BYTES = 3_500_000;
const MAX_PHOTO_BYTES = 2_000_000;

function jpegBytes(size: number): ArrayBuffer {
  const buffer = new ArrayBuffer(Math.max(3, size));
  new Uint8Array(buffer).set([0xff, 0xd8, 0xff]);
  return buffer;
}

function multipartRequest(
  form: FormData,
  overrides: { contentLength?: string } = {},
): Request {
  const request = new Request("http://local.invalid/api/tryon/generate", {
    method: "POST",
    body: form,
  });
  if (overrides.contentLength !== undefined) {
    // A lying Content-Length must be rejected before the body is read at all.
    const headers = new Headers(request.headers);
    headers.set("content-length", overrides.contentLength);
    return new Request(request.url, {
      method: "POST",
      body: request.body,
      headers,
      // @ts-expect-error duplex is required by undici for a stream body.
      duplex: "half",
    });
  }
  return request;
}

function validForm(photoSize = 32_000): FormData {
  const form = new FormData();
  form.set(
    "photo",
    new File([jpegBytes(photoSize)], "subject.jpg", { type: "image/jpeg" }),
  );
  form.set("productId", PRODUCT_ID);
  form.set("background", "studio");
  form.set("idempotencyKey", IDEMPOTENCY_KEY);
  return form;
}

async function expectRejection(
  request: Request,
  code: string,
  status: number,
): Promise<void> {
  const error = await parseTryonMultipart(request).then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(TryonMultipartError);
  expect(error).toMatchObject({ code, status });
}

describe("Drape Room multipart transport bounds", () => {
  it("accepts a well-formed request", async () => {
    const parsed = await parseTryonMultipart(multipartRequest(validForm()));

    expect(parsed.productId).toBe(PRODUCT_ID);
    expect(parsed.background).toBe("studio");
    expect(parsed.idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(parsed.photoMimeType).toBe("image/jpeg");
    expect(parsed.photo.byteLength).toBe(32_000);
  });

  it("rejects a non-multipart content type with 415", async () => {
    const request = new Request("http://local.invalid/api/tryon/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: PRODUCT_ID }),
    });

    await expectRejection(request, "TRYON_INVALID_CONTENT_TYPE", 415);
  });

  it("rejects a base64 JSON image upload with 415", async () => {
    const request = new Request("http://local.invalid/api/tryon/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        photo: `data:image/jpeg;base64,${Buffer.from(new Uint8Array(jpegBytes(64))).toString("base64")}`,
        productId: PRODUCT_ID,
      }),
    });

    await expectRejection(request, "TRYON_INVALID_CONTENT_TYPE", 415);
  });

  it("rejects an oversized advertised Content-Length with 413 before reading the body", async () => {
    const request = multipartRequest(validForm(), {
      contentLength: String(MAX_MULTIPART_BYTES + 1),
    });

    await expectRejection(request, "TRYON_REQUEST_TOO_LARGE", 413);
    // The pre-check must fire before the stream is consumed.
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects a body that streams past the multipart ceiling with 413", async () => {
    // No truthful Content-Length, so only the streaming counter can catch this.
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new Uint8Array(500_000);
        for (let index = 0; index < 8; index += 1) controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request("http://local.invalid/api/tryon/generate", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----ftt" },
      body: oversized,
      // @ts-expect-error duplex is required by undici for a stream body.
      duplex: "half",
    });

    await expectRejection(request, "TRYON_REQUEST_TOO_LARGE", 413);
  });

  it("rejects a photo part above the 2 MB processed-photo ceiling with 413", async () => {
    await expectRejection(
      multipartRequest(validForm(MAX_PHOTO_BYTES + 1)),
      "TRYON_INVALID_PHOTO",
      413,
    );
  });

  it("rejects a non-JPEG photo part with 400", async () => {
    const form = validForm();
    form.set(
      "photo",
      new File([jpegBytes(1_024)], "subject.png", { type: "image/png" }),
    );

    await expectRejection(multipartRequest(form), "TRYON_INVALID_PHOTO", 400);
  });

  it("rejects an empty photo part with 400", async () => {
    const form = validForm();
    form.set("photo", new File([], "subject.jpg", { type: "image/jpeg" }));

    await expectRejection(multipartRequest(form), "TRYON_INVALID_PHOTO", 400);
  });

  // The no-Regenerate contract at the transport layer: the field is not on the
  // allowlist, so it cannot reach the ledger, the quota, or the provider.
  it("rejects the removed regeneration field with 400", async () => {
    for (const value of ["true", "false"]) {
      const form = validForm();
      form.set("regeneration", value);

      await expectRejection(
        multipartRequest(form),
        "TRYON_INVALID_FIELDS",
        400,
      );
    }
  });

  it("rejects any other unexpected field with 400", async () => {
    for (const field of ["prompt", "provider", "model", "drape", "notes", "garment", "productImageUrl"]) {
      const form = validForm();
      form.set(field, "anything");

      await expectRejection(
        multipartRequest(form),
        "TRYON_INVALID_FIELDS",
        400,
      );
    }
  });

  it("rejects a duplicated allowlisted field with 400", async () => {
    const form = validForm();
    form.append("background", "festival");

    await expectRejection(multipartRequest(form), "TRYON_INVALID_FIELDS", 400);
  });

  it("rejects a missing required field with 400", async () => {
    for (const field of ["photo", "productId", "background", "idempotencyKey"]) {
      const form = validForm();
      form.delete(field);

      await expectRejection(
        multipartRequest(form),
        "TRYON_INVALID_FIELDS",
        400,
      );
    }
  });
});
