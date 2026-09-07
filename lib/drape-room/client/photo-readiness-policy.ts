/**
 * Local, pre-generation photo check.
 *
 * This gate exists to catch photos the pipeline genuinely cannot use — an empty
 * frame, a crowd, or an unusable blur — and nothing else. It deliberately does
 * NOT require a particular framing or pose: a head-and-shoulders portrait, a
 * seated shot, a back-facing full-length pose, and a classic full-body photo
 * are all accepted. Skin tone and proportions are read from whatever the photo
 * actually shows.
 *
 * Landmarks are ephemeral. Only the versioned pass/fail marker below may be
 * written to browser storage; the caller must discard the landmarks.
 */
export const PHOTO_READINESS_POLICY_VERSION = "person-present-v2" as const;

export type PhotoReadinessFailureCode =
  | "no-person"
  | "multiple-people"
  | "person-too-small"
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
const MIN_SHARPNESS = 18;
/**
 * The subject's visible landmarks must span at least this share of the larger
 * image edge. Loose on purpose: it only rejects a person so small that no
 * usable detail survives, not a particular crop.
 */
const MIN_SUBJECT_EXTENT_RATIO = 0.1;

/** Any one of these means a head is visible. */
const HEAD_LANDMARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Any one of these means a body is visible, with or without a face. */
const BODY_LANDMARKS = [
  11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
] as const;

const MESSAGE: Record<PhotoReadinessFailureCode, string> = {
  "no-person":
    "Choose a photo with one person in it. A face, an upper body, or a full-length pose all work.",
  "multiple-people": "Choose a photo containing only one person.",
  "person-too-small":
    "The person is very small in this photo. Move closer or crop in a little.",
  "too-blurry": "Choose a sharper, better-lit photo.",
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

function visiblePoints(
  pose: readonly ReadinessPoseLandmark[],
  indices: readonly number[],
): ReadinessPoseLandmark[] {
  const points: ReadinessPoseLandmark[] = [];
  for (const index of indices) {
    const point = visible(pose, index);
    if (point) points.push(point);
  }
  return points;
}

/** Largest edge of the box containing every visible landmark, in pixels. */
function subjectExtentPx(
  points: readonly ReadinessPoseLandmark[],
  width: number,
  height: number,
): number {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const spanX = (Math.max(...xs) - Math.min(...xs)) * width;
  const spanY = (Math.max(...ys) - Math.min(...ys)) * height;
  return Math.max(spanX, spanY);
}

/**
 * Accepts any photo containing exactly one recognisable person, in any pose and
 * any crop. Only an unusable frame is rejected.
 */
export function evaluatePhotoReadiness(
  observation: PhotoReadinessObservation,
): PhotoReadinessResult {
  if (
    !Number.isFinite(observation.width) ||
    !Number.isFinite(observation.height) ||
    observation.width <= 0 ||
    observation.height <= 0
  ) {
    return blocked("no-person");
  }
  if (observation.poses.length === 0) return blocked("no-person");
  if (observation.poses.length !== 1) return blocked("multiple-people");

  const pose = observation.poses[0]!;
  const head = visiblePoints(pose, HEAD_LANDMARKS);
  const body = visiblePoints(pose, BODY_LANDMARKS);
  // A face alone is enough, and so is a body with no face showing.
  if (head.length === 0 && body.length === 0) return blocked("no-person");

  // A single landmark gives a degenerate box, so size is only assessed when
  // there is something to measure across.
  const points = [...head, ...body];
  if (points.length >= 2) {
    const extentPx = subjectExtentPx(
      points,
      observation.width,
      observation.height,
    );
    const frameExtentPx = Math.max(observation.width, observation.height);
    if (extentPx < frameExtentPx * MIN_SUBJECT_EXTENT_RATIO) {
      return blocked("person-too-small");
    }
  }

  if (
    !Number.isFinite(observation.sharpness) ||
    observation.sharpness < MIN_SHARPNESS
  ) {
    return blocked("too-blurry");
  }
  return { ready: true, policyVersion: PHOTO_READINESS_POLICY_VERSION };
}
