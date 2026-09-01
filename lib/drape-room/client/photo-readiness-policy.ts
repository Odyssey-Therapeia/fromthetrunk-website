export const PHOTO_READINESS_POLICY_VERSION = "face-visible-v1" as const;

export type PhotoReadinessFailureCode =
  | "no-face"
  | "multiple-faces"
  | "face-too-small"
  | "face-cropped"
  | "too-blurry";

export type PhotoReadinessResult =
  | {
      ready: true;
      policyVersion: typeof PHOTO_READINESS_POLICY_VERSION;
    }
  | {
      ready: false;
      policyVersion: typeof PHOTO_READINESS_POLICY_VERSION;
      reason: PhotoReadinessFailureCode;
      message: string;
    };

export interface ReadinessFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoReadinessObservation {
  width: number;
  height: number;
  faces: ReadinessFaceBox[];
  /** Laplacian variance sampled from the detected face region. */
  sharpness: number;
}

const MIN_FACE_EDGE_PX = 56;
const MIN_FACE_AREA_PX = 3_200;
const MIN_SHARPNESS = 18;

const MESSAGE: Record<PhotoReadinessFailureCode, string> = {
  "no-face": "Choose a photo where your face is clearly visible.",
  "multiple-faces": "Choose a photo containing only one visible face.",
  "face-too-small": "Choose a closer or higher-resolution photo so your face stays clear.",
  "face-cropped": "Keep your complete face inside the frame.",
  "too-blurry": "Choose a sharper photo with your face in focus.",
};

function blocked(reason: PhotoReadinessFailureCode): PhotoReadinessResult {
  return {
    ready: false,
    policyVersion: PHOTO_READINESS_POLICY_VERSION,
    reason,
    message: MESSAGE[reason],
  };
}

/**
 * A clear single face is the only composition requirement. Body, pose,
 * orientation, shoulders, hips, knees, feet, and background are optional.
 */
export function evaluatePhotoReadiness(
  observation: PhotoReadinessObservation,
): PhotoReadinessResult {
  if (observation.faces.length === 0) return blocked("no-face");
  if (observation.faces.length !== 1) return blocked("multiple-faces");

  const face = observation.faces[0]!;
  if (
    !Number.isFinite(face.x) ||
    !Number.isFinite(face.y) ||
    !Number.isFinite(face.width) ||
    !Number.isFinite(face.height) ||
    face.width < MIN_FACE_EDGE_PX ||
    face.height < MIN_FACE_EDGE_PX ||
    face.width * face.height < MIN_FACE_AREA_PX
  ) {
    return blocked("face-too-small");
  }
  if (
    face.x <= 1 ||
    face.y <= 1 ||
    face.x + face.width >= observation.width - 1 ||
    face.y + face.height >= observation.height - 1
  ) {
    return blocked("face-cropped");
  }
  if (
    !Number.isFinite(observation.sharpness) ||
    observation.sharpness < MIN_SHARPNESS
  ) {
    return blocked("too-blurry");
  }

  return { ready: true, policyVersion: PHOTO_READINESS_POLICY_VERSION };
}
