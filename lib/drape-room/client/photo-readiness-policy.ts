export const PHOTO_READINESS_POLICY_VERSION = "full-body-pose-v1" as const;

export type PhotoReadinessFailureCode =
  | "no-person"
  | "multiple-people"
  | "not-portrait"
  | "head-not-visible"
  | "shoulders-not-visible"
  | "hips-not-visible"
  | "knees-not-visible"
  | "feet-not-visible"
  | "person-too-small"
  | "person-cropped"
  | "torso-obscured"
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

export interface ReadinessPoseLandmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface PhotoReadinessObservation {
  width: number;
  height: number;
  poses: ReadinessPoseLandmark[][];
  /** Laplacian variance sampled from the detected person's region. */
  sharpness: number;
}

const MIN_VISIBILITY = 0.5;
const MIN_BODY_HEIGHT_RATIO = 0.55;
const MIN_SHOULDER_WIDTH_PX = 55;
const MIN_SHARPNESS = 18;
const FRAME_MARGIN = 0.005;

const MESSAGE: Record<PhotoReadinessFailureCode, string> = {
  "no-person": "Choose a full-body photo where one person is clearly visible.",
  "multiple-people": "Choose a photo containing only one person.",
  "not-portrait": "Choose a portrait or near-portrait full-body photo.",
  "head-not-visible": "Keep your complete head and face visible in the frame.",
  "shoulders-not-visible": "Keep both shoulders visible and unobstructed.",
  "hips-not-visible": "Use a full-body photo with both hips visible.",
  "knees-not-visible": "Use a full-body photo with both knees visible.",
  "feet-not-visible": "Keep both ankles or feet visible inside the frame.",
  "person-too-small": "Move closer while keeping your complete body in the frame.",
  "person-cropped": "Keep your complete body, including head and feet, inside the frame.",
  "torso-obscured": "Keep your torso visible and avoid crossing both arms over it.",
  "too-blurry": "Choose a sharper, well-lit full-body photo.",
};

function blocked(reason: PhotoReadinessFailureCode): PhotoReadinessResult {
  return {
    ready: false,
    policyVersion: PHOTO_READINESS_POLICY_VERSION,
    reason,
    message: MESSAGE[reason],
  };
}

function visible(
  pose: readonly ReadinessPoseLandmark[],
  index: number,
): ReadinessPoseLandmark | null {
  const point = pose[index];
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    (point.visibility ?? 1) < MIN_VISIBILITY
  ) {
    return null;
  }
  return point;
}

function visiblePair(
  pose: readonly ReadinessPoseLandmark[],
  left: number,
  right: number,
): [ReadinessPoseLandmark, ReadinessPoseLandmark] | null {
  const leftPoint = visible(pose, left);
  const rightPoint = visible(pose, right);
  return leftPoint && rightPoint ? [leftPoint, rightPoint] : null;
}

function visibleFoot(
  pose: readonly ReadinessPoseLandmark[],
  indices: readonly number[],
): ReadinessPoseLandmark | null {
  for (const index of indices) {
    const point = visible(pose, index);
    if (point) return point;
  }
  return null;
}

function inFrame(point: ReadinessPoseLandmark): boolean {
  return (
    point.x > FRAME_MARGIN &&
    point.y > FRAME_MARGIN &&
    point.x < 1 - FRAME_MARGIN &&
    point.y < 1 - FRAME_MARGIN
  );
}

function torsoIsObscured(
  pose: readonly ReadinessPoseLandmark[],
  shoulders: readonly [ReadinessPoseLandmark, ReadinessPoseLandmark],
  hips: readonly [ReadinessPoseLandmark, ReadinessPoseLandmark],
): boolean {
  const wrists = visiblePair(pose, 15, 16);
  if (!wrists) return false;
  const minShoulderX = Math.min(shoulders[0].x, shoulders[1].x);
  const maxShoulderX = Math.max(shoulders[0].x, shoulders[1].x);
  const shoulderY = (shoulders[0].y + shoulders[1].y) / 2;
  const hipY = (hips[0].y + hips[1].y) / 2;
  const upperTorsoBottom = shoulderY + (hipY - shoulderY) * 0.62;
  const bothAcrossUpperTorso = wrists.every(
    (wrist) =>
      wrist.x > minShoulderX &&
      wrist.x < maxShoulderX &&
      wrist.y > shoulderY &&
      wrist.y < upperTorsoBottom,
  );
  if (!bothAcrossUpperTorso) return false;
  const leftCrossed =
    Math.abs(wrists[0].x - shoulders[1].x) <
    Math.abs(wrists[0].x - shoulders[0].x);
  const rightCrossed =
    Math.abs(wrists[1].x - shoulders[0].x) <
    Math.abs(wrists[1].x - shoulders[1].x);
  return leftCrossed && rightCrossed;
}

/**
 * Pure policy over ephemeral Pose Landmarker output. The caller must discard
 * landmarks after this result is produced; only the versioned pass/fail marker
 * is suitable for browser storage.
 */
export function evaluatePhotoReadiness(
  observation: PhotoReadinessObservation,
): PhotoReadinessResult {
  if (observation.poses.length === 0) return blocked("no-person");
  if (observation.poses.length !== 1) return blocked("multiple-people");
  if (
    !Number.isFinite(observation.width) ||
    !Number.isFinite(observation.height) ||
    observation.width <= 0 ||
    observation.height <= 0 ||
    observation.width / observation.height > 1.2
  ) {
    return blocked("not-portrait");
  }

  const pose = observation.poses[0]!;
  const nose = visible(pose, 0);
  const eyes = visiblePair(pose, 2, 5);
  if (!nose || !eyes) return blocked("head-not-visible");
  const shoulders = visiblePair(pose, 11, 12);
  if (!shoulders) return blocked("shoulders-not-visible");
  const hips = visiblePair(pose, 23, 24);
  if (!hips) return blocked("hips-not-visible");
  const knees = visiblePair(pose, 25, 26);
  if (!knees) return blocked("knees-not-visible");
  const leftFoot = visibleFoot(pose, [27, 29, 31]);
  const rightFoot = visibleFoot(pose, [28, 30, 32]);
  if (!leftFoot || !rightFoot) return blocked("feet-not-visible");

  const requiredPoints = [
    nose,
    ...eyes,
    ...shoulders,
    ...hips,
    ...knees,
    leftFoot,
    rightFoot,
  ];
  if (requiredPoints.some((point) => !inFrame(point))) {
    return blocked("person-cropped");
  }
  const bodyHeightRatio = Math.max(leftFoot.y, rightFoot.y) - nose.y;
  const shoulderWidthPx =
    Math.abs(shoulders[0].x - shoulders[1].x) * observation.width;
  if (
    bodyHeightRatio < MIN_BODY_HEIGHT_RATIO ||
    shoulderWidthPx < MIN_SHOULDER_WIDTH_PX
  ) {
    return blocked("person-too-small");
  }
  if (torsoIsObscured(pose, shoulders, hips)) {
    return blocked("torso-obscured");
  }
  if (
    !Number.isFinite(observation.sharpness) ||
    observation.sharpness < MIN_SHARPNESS
  ) {
    return blocked("too-blurry");
  }
  return { ready: true, policyVersion: PHOTO_READINESS_POLICY_VERSION };
}
