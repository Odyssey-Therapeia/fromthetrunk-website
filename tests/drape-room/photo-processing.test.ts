import imageCompression from "browser-image-compression";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PROCESSED_PHOTO_BYTES,
  MAX_PROCESSED_PHOTO_EDGE,
  MAX_SOURCE_PHOTO_BYTES,
  PhotoProcessingError,
  processUserPhoto,
  validateSourcePhoto,
} from "@/lib/drape-room/client/photo-processing";

vi.mock("browser-image-compression", () => ({
  default: vi.fn(),
}));

const compress = vi.mocked(imageCompression);
const readinessPass = vi.fn().mockResolvedValue({
  ready: true as const,
  policyVersion: "face-visible-v1" as const,
});

function jpegFile(size = 1_024, name = "portrait.jpg"): File {
  const bytes = new Uint8Array(Math.max(3, size));
  bytes.set([0xff, 0xd8, 0xff]);
  return new File([bytes], name, { type: "image/jpeg" });
}

function bitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

describe("Drape Room photo processing", () => {
  beforeEach(() => {
    compress.mockReset();
    readinessPass.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects SVG, PDF, unsupported, and oversized source files before decoding", async () => {
    await expect(
      validateSourcePhoto(
        new File(["<svg></svg>"], "portrait.svg", {
          type: "image/svg+xml",
        }),
      ),
    ).rejects.toMatchObject({ code: "unsupported-type" });

    await expect(
      validateSourcePhoto(
        new File(["%PDF-1.7"], "portrait.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-image" });

    await expect(
      validateSourcePhoto(jpegFile(MAX_SOURCE_PHOTO_BYTES + 1)),
    ).rejects.toMatchObject({ code: "source-too-large" });
  });

  it("rejects decoded images above forty megapixels", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap(8_000, 6_000)));

    await expect(validateSourcePhoto(jpegFile())).rejects.toMatchObject({
      code: "too-many-pixels",
    });
  });

  it("outputs a stripped JPEG using the bounded main-thread compression policy", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockResolvedValueOnce(bitmap(3_000, 4_000))
        .mockResolvedValueOnce(bitmap(960, 1_280)),
    );
    compress.mockResolvedValue(jpegFile(64 * 1_024, "prepared.jpg"));

    const result = await processUserPhoto(jpegFile(), {
      analyzeReadiness: readinessPass,
    });

    expect(compress).toHaveBeenCalledTimes(1);
    expect(compress).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        maxSizeMB: 1_900_000 / (1024 * 1024),
        maxWidthOrHeight: MAX_PROCESSED_PHOTO_EDGE,
        fileType: "image/jpeg",
        initialQuality: 0.92,
        preserveExif: false,
        useWebWorker: false,
      }),
    );
    expect(result).toMatchObject({
      mimeType: "image/jpeg",
      width: 960,
      height: 1_280,
      sourceWidth: 3_000,
      sourceHeight: 4_000,
    });
    expect(result.byteSize).toBeLessThanOrEqual(MAX_PROCESSED_PHOTO_BYTES);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.readiness).toMatchObject({
      state: "ready",
      policyVersion: "face-visible-v1",
    });
    expect(readinessPass).toHaveBeenCalledWith(result.blob);
  });

  it("uses the exact two-million-byte ceiling and exposes progress", async () => {
    expect(MAX_PROCESSED_PHOTO_BYTES).toBe(2_000_000);
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockResolvedValueOnce(bitmap(900, 1_200))
        .mockResolvedValueOnce(bitmap(900, 1_200)),
    );
    compress.mockResolvedValue(jpegFile(32_000));
    const onProgress = vi.fn();
    await processUserPhoto(jpegFile(), {
      onProgress,
      analyzeReadiness: readinessPass,
    });
    expect(compress).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ onProgress }),
    );
  });

  it("warns without rejecting small, landscape, and extreme photos", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(bitmap(1_000, 300)),
    );
    const validated = await validateSourcePhoto(jpegFile());
    expect(validated.warnings).toEqual(
      expect.arrayContaining(["very-small", "landscape", "extreme-aspect"]),
    );
  });

  it("runs a stricter second pass and fails closed above two megabytes", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue(bitmap(960, 1_280)),
    );
    const tooLarge = jpegFile(MAX_PROCESSED_PHOTO_BYTES + 1, "large.jpg");
    compress.mockResolvedValue(tooLarge);

    await expect(
      processUserPhoto(jpegFile(), { analyzeReadiness: readinessPass }),
    ).rejects.toBeInstanceOf(
      PhotoProcessingError,
    );
    expect(compress).toHaveBeenCalledTimes(2);
    expect(compress.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        maxSizeMB: 1_800_000 / (1024 * 1024),
        initialQuality: 0.88,
        preserveExif: false,
        useWebWorker: false,
      }),
    );
  });

  it("blocks a failed local face check before returning provider input", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockResolvedValueOnce(bitmap(900, 1_200))
        .mockResolvedValueOnce(bitmap(900, 1_200)),
    );
    compress.mockResolvedValue(jpegFile(32_000));
    const blocked = vi.fn().mockResolvedValue({
      ready: false as const,
      policyVersion: "face-visible-v1" as const,
      reason: "no-face" as const,
      message: "Choose a photo where your face is clearly visible.",
    });

    await expect(
      processUserPhoto(jpegFile(), { analyzeReadiness: blocked }),
    ).rejects.toMatchObject({ code: "readiness-failed" });
    expect(blocked).toHaveBeenCalledTimes(1);
  });
});
