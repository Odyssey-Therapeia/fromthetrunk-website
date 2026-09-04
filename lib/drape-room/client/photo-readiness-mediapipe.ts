"use client";

import type {
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import {
  evaluatePhotoReadiness,
  type PhotoReadinessObservation,
  type PhotoReadinessResult,
} from "./photo-readiness-policy";

const ASSET_ROOT = "/drape-room/vision/mediapipe-1.0.1";

interface PhotoReadinessDetector {
  pose: PoseLandmarker;
}

let detectorPromise: Promise<PhotoReadinessDetector> | null = null;

async function loadDetector(): Promise<PhotoReadinessDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const files = await FilesetResolver.forVisionTasks(`${ASSET_ROOT}/wasm`);
      const pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${ASSET_ROOT}/models/pose_landmarker_lite.task`,
        },
        runningMode: "IMAGE",
        numPoses: 2,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        outputSegmentationMasks: false,
      });
      return { pose };
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

function poseBounds(
  landmarks: readonly NormalizedLandmark[],
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  const points = landmarks.filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.visibility >= 0.5,
  );
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x * width);
  const ys = points.map((point) => point.y * height);
  const x = Math.max(0, Math.min(...xs));
  const y = Math.max(0, Math.min(...ys));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.max(...xs) - x)),
    height: Math.max(1, Math.min(height - y, Math.max(...ys) - y)),
  };
}

function estimateSharpness(
  source: CanvasImageSource,
  width: number,
  height: number,
  bounds: { x: number; y: number; width: number; height: number },
): number {
  if (typeof document === "undefined") return Number.POSITIVE_INFINITY;
  const canvas = document.createElement("canvas");
  const paddingX = bounds.width * 0.08;
  const paddingY = bounds.height * 0.04;
  const sourceX = Math.max(0, bounds.x - paddingX);
  const sourceY = Math.max(0, bounds.y - paddingY);
  const sourceWidth = Math.max(
    1,
    Math.min(width - sourceX, bounds.width + paddingX * 2),
  );
  const sourceHeight = Math.max(
    1,
    Math.min(height - sourceY, bounds.height + paddingY * 2),
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
        pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114;
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
    const { pose } = await loadDetector();
    if (typeof requestAnimationFrame === "function") {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const result = pose.detect(decoded.source);
    const bounds =
      result.landmarks.length === 1
        ? poseBounds(result.landmarks[0]!, decoded.width, decoded.height)
        : null;
    const observation: PhotoReadinessObservation = {
      width: decoded.width,
      height: decoded.height,
      poses: result.landmarks.map((landmarks) =>
        landmarks.map(({ x, y, visibility }) => ({ x, y, visibility })),
      ),
      sharpness: bounds
        ? estimateSharpness(
            decoded.source,
            decoded.width,
            decoded.height,
            bounds,
          )
        : Number.POSITIVE_INFINITY,
    };
    return evaluatePhotoReadiness(observation);
  } finally {
    decoded.close();
  }
}
