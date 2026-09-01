import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_BROWSER_OUTPUT_BYTES,
  MAX_CUSTOMER_SOURCE_BYTES,
  MAX_NORMALIZED_REFERENCE_BYTES,
  MAX_PRODUCT_SOURCE_BYTES,
  validateAndNormalizeProviderImage,
  validateAndNormalizeReferenceImage,
} from "@/lib/drape-room/server/image-validation";

async function image(
  format: "jpeg" | "png" | "webp",
  width = 640,
  height = 800,
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: {
      background: { b: 90, g: 45, r: 120 },
      channels: 3,
      height,
      width,
    },
  });
  const data =
    format === "jpeg"
      ? await pipeline.jpeg().toBuffer()
      : format === "png"
        ? await pipeline.png().toBuffer()
        : await pipeline.webp().toBuffer();
  return Uint8Array.from(data);
}

async function animatedWebp(): Promise<Uint8Array> {
  const width = 300;
  const pageHeight = 300;
  const height = pageHeight * 2;
  const channels = 4;
  const raw = Buffer.alloc(width * height * channels);
  for (let index = 0; index < raw.length; index += channels) {
    const secondFrame = index >= width * pageHeight * channels;
    raw[index] = secondFrame ? 220 : 20;
    raw[index + 1] = secondFrame ? 20 : 220;
    raw[index + 2] = 40;
    raw[index + 3] = 255;
  }
  const encoded = await sharp(raw, {
    animated: true,
    raw: { channels, height, pageHeight, width },
  })
    .webp({ delay: [100, 100], loop: 0 })
    .toBuffer();
  return Uint8Array.from(encoded);
}

async function largeTrustedProductPng(): Promise<Uint8Array> {
  const width = 1_536;
  const height = 1_536;
  const channels = 3;
  const raw = Buffer.allocUnsafe(width * height * channels);
  let state = 0x12345678;
  for (let index = 0; index < raw.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    raw[index] = state & 0xff;
  }
  return Uint8Array.from(
    await sharp(raw, { raw: { channels, height, width } })
      .png({ compressionLevel: 0 })
      .toBuffer(),
  );
}

describe("Drape Room image validation", () => {
  it("auto-orients, strips metadata, and bounds input references", async () => {
    const source = await sharp({
      create: {
        background: "#78345a",
        channels: 3,
        height: 800,
        width: 640,
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const normalized = await validateAndNormalizeReferenceImage(
      {
        bytes: Uint8Array.from(source),
        mimeType: "image/jpeg",
      },
      { maxSourceBytes: MAX_CUSTOMER_SOURCE_BYTES },
    );
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe("image/jpeg");
    expect(normalized.width).toBe(800);
    expect(normalized.height).toBe(640);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.space).toBe("srgb");
    expect(normalized.bytes.byteLength).toBeLessThanOrEqual(2_000_000);
  });

  it("accepts a bounded trusted product original while keeping the customer ceiling at 2 MB", async () => {
    const source = await largeTrustedProductPng();
    expect(source.byteLength).toBeGreaterThan(MAX_CUSTOMER_SOURCE_BYTES);
    expect(source.byteLength).toBeLessThanOrEqual(MAX_PRODUCT_SOURCE_BYTES);

    await expect(
      validateAndNormalizeReferenceImage(
        { bytes: source, mimeType: "image/png" },
        { maxSourceBytes: MAX_CUSTOMER_SOURCE_BYTES },
      ),
    ).rejects.toMatchObject({ code: "image_too_large" });

    const normalized = await validateAndNormalizeReferenceImage(
      { bytes: source, mimeType: "image/png" },
      { maxSourceBytes: MAX_PRODUCT_SOURCE_BYTES },
    );
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe("image/jpeg");
    expect(Math.max(normalized.width, normalized.height)).toBe(1_536);
    expect(normalized.bytes.byteLength).toBeLessThanOrEqual(
      MAX_NORMALIZED_REFERENCE_BYTES,
    );
    expect(metadata.exif).toBeUndefined();
  });

  it("normalizes an untrusted provider image to one exact 3:4 bounded JPEG", async () => {
    const normalized = await validateAndNormalizeProviderImage({
      bytes: await image("png", 1_024, 1_365),
      mimeType: "image/png",
    });
    const metadata = await sharp(normalized.bytes, { animated: true }).metadata();

    expect(normalized.mimeType).toBe("image/jpeg");
    expect(normalized.width).toBe(1_152);
    expect(normalized.height).toBe(1_536);
    expect(normalized.bytes.byteLength).toBeLessThanOrEqual(
      MAX_BROWSER_OUTPUT_BYTES,
    );
    expect(metadata.pages ?? 1).toBe(1);
    expect(metadata.space).toBe("srgb");
    expect((metadata.width ?? 0) * (metadata.height ?? 0)).toBeLessThanOrEqual(
      24_000_000,
    );
  });

  it.each([
    [
      "magic/MIME mismatch",
      async () => ({ bytes: await image("png"), mimeType: "image/jpeg" as const }),
      "mime_mismatch",
    ],
    [
      "small dimensions",
      async () => ({ bytes: await image("jpeg", 128, 128), mimeType: "image/jpeg" as const }),
      "dimensions_out_of_range",
    ],
    [
      "oversized source",
      async () => ({
        bytes: new Uint8Array(MAX_CUSTOMER_SOURCE_BYTES + 1),
        mimeType: "image/jpeg" as const,
      }),
      "image_too_large",
    ],
    [
      "multiple frames",
      async () => ({ bytes: await animatedWebp(), mimeType: "image/webp" as const }),
      "multiple_frames",
    ],
  ])("rejects %s", async (_label, makeInput, code) => {
    await expect(
      validateAndNormalizeReferenceImage(await makeInput(), {
        maxSourceBytes: MAX_CUSTOMER_SOURCE_BYTES,
      }),
    ).rejects.toMatchObject({ code });
  });
});
