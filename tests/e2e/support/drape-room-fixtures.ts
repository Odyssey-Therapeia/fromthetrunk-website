import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const APP_ORIGIN =
  process.env.FTT_DRAPE_E2E_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://localhost:3000";
export const HARNESS_PATH = "/collection/e2e/drape-room";
export const PRODUCT_PATH = "/collection/e2e-classic-nivi-saree";
export const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
export const PRODUCT_NAME = "E2E Classic Nivi Saree";
export const TRIGGER_NAME = `Open Drape Room for ${PRODUCT_NAME}`;
export const ONBOARDING_KEY = "ftt.drape.onboarding.seen:v1";
export const CONSENT_KEY = "ftt.drape.consent:v1";
export const CART_KEY = "ftt-cart-v2";
export const RESULT_REFERENCE_VERSION = "e2e-product-reference-v1";
export const CONSENT_TOKEN =
  "v1.1787700000000.1787700300000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const CONFIG = {
  enabled: true,
  provider: "google",
  providerDisplayName: "Google Gemini API",
  model: "gemini-3.1-flash-image",
  promptVersion: "nivi-v4",
  referenceContractVersion: "gallery-v2",
  engineVersion: "drape-engine-v1",
  outputVersion: "jpeg-3x4-v1",
  outputMimeType: "image/jpeg",
  aspectRatio: "3:4",
  imageSize: "1K",
  disclosureVersion: "e2e-disclosure-v1",
  privacyPolicyVersion: "2026-08-26",
  providerPolicyUrl: "https://ai.google.dev/gemini-api/terms",
  providerRetentionSummary:
    "This deterministic test response never sends an image to Google.",
} as const;

export const AI_DISCLAIMER =
  "This is an AI-generated visual preview. The actual saree’s colour, texture, pleats, border placement, pallu and fit may vary. Please use the original product photographs and description as the source of truth. Any blouse, jewellery or background shown may be AI-generated and is not included unless stated on the product page.";

export const PRIVACY_PARAGRAPHS = [
  "Your working photo and generated previews are stored locally in this browser. From the Trunk does not save these images in its own database or object storage.",
  "When you select Create my drape, your photo and the selected saree image are securely transmitted through our hosting infrastructure to the AI provider identified below. The provider may process or retain the images according to its API data policy.",
  "You can remove your photo and locally stored previews at any time using Clear my try-on data.",
] as const;

export type EntryName =
  | "Product card entry"
  | "PDP desktop entry"
  | "PDP mobile sticky entry";

export type DrapeRoomImageFixtures = {
  generatedJpeg: Buffer;
  /**
   * A real headshot: the head-and-shoulders region of the same real subject,
   * cropped so hips, knees and feet are outside the frame. Derived from the
   * committed full-body photo so the negative case uses genuine image data
   * (real MediaPipe must actually find a person, then reject the framing)
   * rather than synthetic landmarks.
   */
  headshotJpeg: Buffer;
  replacementJpeg: Buffer;
  subjectJpeg: Buffer;
};

export async function buildDrapeRoomImageFixtures(): Promise<DrapeRoomImageFixtures> {
  const subjectJpeg = await readFile(
    join(process.cwd(), "tests/e2e/fixtures/full-body-subject.jpg"),
  );
  const generatedJpeg = await deterministicJpeg(
    1_024,
    1_365,
    0x2468ace0,
    88,
  );
  const replacementJpeg = await sharp(subjectJpeg)
    .modulate({ brightness: 1.02, saturation: 0.96 })
    .jpeg({ quality: 90 })
    .toBuffer();
  const headshotJpeg = await buildHeadshot(subjectJpeg);

  return { generatedJpeg, headshotJpeg, replacementJpeg, subjectJpeg };
}

/**
 * Crop the top of the full-body frame to head-and-shoulders and upscale it back
 * to a normal portrait size, so the result is a plausible headshot upload
 * rather than a thin strip. Deterministic: same input bytes -> same output.
 */
async function buildHeadshot(subjectJpeg: Buffer): Promise<Buffer> {
  const { height = 0, width = 0 } = await sharp(subjectJpeg).metadata();
  if (!width || !height) {
    throw new Error("The full-body fixture is missing image dimensions.");
  }
  // The subject stands centred; the head occupies roughly the top fifth. Taking
  // the top 28% keeps head and shoulders and drops the hips entirely.
  const cropHeight = Math.round(height * 0.28);
  const cropWidth = Math.round(width * 0.6);
  return sharp(subjectJpeg)
    .extract({
      left: Math.round((width - cropWidth) / 2),
      top: 0,
      width: cropWidth,
      height: cropHeight,
    })
    .resize({ width: 900, height: 1_200, fit: "cover", position: "top" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function deterministicJpeg(
  width: number,
  height: number,
  seed: number,
  quality: number,
): Promise<Buffer> {
  const pixels = Buffer.allocUnsafe(width * height * 3);
  let state = seed >>> 0;
  for (let index = 0; index < pixels.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    pixels[index] = state >>> 24;
  }
  return sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
