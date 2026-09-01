"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";
import {
  evaluatePhotoReadiness,
  type PhotoReadinessObservation,
  type PhotoReadinessResult,
} from "./photo-readiness-policy";

const ASSET_ROOT = "/drape-room/vision/mediapipe-1.0.1";

interface FaceReadinessDetector {
  face: FaceDetector;
}

let detectorPromise: Promise<FaceReadinessDetector> | null = null;

async function loadDetector(): Promise<FaceReadinessDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const files = await FilesetResolver.forVisionTasks(`${ASSET_ROOT}/wasm`);
      const face = await FaceDetector.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: `${ASSET_ROOT}/models/blaze_face_full_range.tflite`,
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.6,
        });
      return { face };
    })().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

async function decodeImage(blob: Blob): Promise<{
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  if (
    typeof window === "undefined" ||
    typeof window.Image !== "function" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("photo_readiness_browser_unsupported");
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("photo_readiness_decode_failed"));
    element.src = objectUrl;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(objectUrl),
  };
}

function estimateSharpness(
  source: CanvasImageSource,
  width: number,
  height: number,
  face: { x: number; y: number; width: number; height: number },
): number {
  if (typeof document === "undefined") return Number.POSITIVE_INFINITY;
  const canvas = document.createElement("canvas");
  const paddingX = face.width * 0.12;
  const paddingY = face.height * 0.12;
  const sourceX = Math.max(0, face.x - paddingX);
  const sourceY = Math.max(0, face.y - paddingY);
  const sourceWidth = Math.max(
    1,
    Math.min(width - sourceX, face.width + paddingX * 2),
  );
  const sourceHeight = Math.max(
    1,
    Math.min(height - sourceY, face.height + paddingY * 2),
  );
  const sampleWidth = Math.max(32, Math.min(160, Math.round(sourceWidth)));
  const sampleHeight = Math.max(
    32,
    Math.round((sourceHeight / sourceWidth) * sampleWidth),
  );
  canvas.width = sampleWidth;
  canvas.height = Math.min(240, sampleHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return Number.POSITIVE_INFINITY;
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const gray = (index: number) =>
        pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
      const laplacian =
        gray(offset - canvas.width * 4) +
        gray(offset + canvas.width * 4) +
        gray(offset - 4) +
        gray(offset + 4) -
        4 * gray(offset);
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export async function analyzePhotoReadiness(
  blob: Blob,
): Promise<PhotoReadinessResult> {
  const decoded = await decodeImage(blob);
  try {
    const { face } = await loadDetector();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const faceResult = face.detect(decoded.source);
    const faces = faceResult.detections.flatMap((detection) => {
      const box = detection.boundingBox;
      return box
        ? [{ x: box.originX, y: box.originY, width: box.width, height: box.height }]
        : [];
    });
    const observation: PhotoReadinessObservation = {
      width: decoded.width,
      height: decoded.height,
      faces,
      sharpness:
        faces.length === 1
          ? estimateSharpness(decoded.source, decoded.width, decoded.height, faces[0]!)
          : Number.POSITIVE_INFINITY,
    };
    return evaluatePhotoReadiness(observation);
  } finally {
    decoded.close();
  }
}
