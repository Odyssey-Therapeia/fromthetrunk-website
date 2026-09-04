import { describe, expect, it } from "vitest";

import {
  evaluatePhotoReadiness,
  PHOTO_READINESS_POLICY_VERSION,
  type PhotoReadinessObservation,
  type ReadinessPoseLandmark,
} from "@/lib/drape-room/client/photo-readiness-policy";

function fullBodyPose(): ReadinessPoseLandmark[] {
  const pose = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
  }));
  const set = (index: number, x: number, y: number) => {
    pose[index] = { x, y, visibility: 0.98 };
  };
  set(0, 0.5, 0.08);
  set(2, 0.47, 0.1);
  set(5, 0.53, 0.1);
  set(11, 0.4, 0.22);
  set(12, 0.6, 0.22);
  set(23, 0.43, 0.5);
  set(24, 0.57, 0.5);
  set(25, 0.44, 0.7);
  set(26, 0.56, 0.7);
  set(27, 0.45, 0.9);
  set(28, 0.55, 0.9);
  return pose;
}

function observation(
  overrides: Partial<PhotoReadinessObservation> = {},
): PhotoReadinessObservation {
  return {
    width: 900,
    height: 1_200,
    poses: [fullBodyPose()],
    sharpness: 80,
    ...overrides,
  };
}

function hide(pose: ReadinessPoseLandmark[], ...indices: number[]) {
  for (const index of indices) pose[index] = { ...pose[index]!, visibility: 0 };
  return pose;
}

describe("Drape Room full-body photo readiness policy", () => {
  it("accepts one clear, uncropped full-body portrait", () => {
    expect(evaluatePhotoReadiness(observation())).toEqual({
      ready: true,
      policyVersion: PHOTO_READINESS_POLICY_VERSION,
    });
  });

  it("rejects a headshot and an upper-body crop", () => {
    expect(
      evaluatePhotoReadiness(
        observation({ poses: [hide(fullBodyPose(), 23, 24, 25, 26, 27, 28)] }),
      ),
    ).toMatchObject({ reason: "hips-not-visible" });
    expect(
      evaluatePhotoReadiness(
        observation({ poses: [hide(fullBodyPose(), 25, 26, 27, 28)] }),
      ),
    ).toMatchObject({ reason: "knees-not-visible" });
  });

  it("rejects zero or multiple people", () => {
    expect(evaluatePhotoReadiness(observation({ poses: [] }))).toMatchObject({
      reason: "no-person",
    });
    expect(
      evaluatePhotoReadiness(
        observation({ poses: [fullBodyPose(), fullBodyPose()] }),
      ),
    ).toMatchObject({ reason: "multiple-people" });
  });

  it.each([
    // Head and shoulders are checked before hips/knees/feet, so a headshot that
    // crops the face, or a photo where the shoulders are not resolved, must be
    // blocked by their own branches rather than falling through.
    [[0], "head-not-visible"],
    [[2, 5], "head-not-visible"],
    [[11, 12], "shoulders-not-visible"],
    [[23, 24], "hips-not-visible"],
    [[25, 26], "knees-not-visible"],
    [[27, 28, 29, 30, 31, 32], "feet-not-visible"],
  ] as const)("rejects missing required landmarks %#", (indices, reason) => {
    expect(
      evaluatePhotoReadiness(
        observation({ poses: [hide(fullBodyPose(), ...indices)] }),
      ),
    ).toMatchObject({ reason });
  });

  it("rejects landscape, extreme crop, crossed arms, and severe blur", () => {
    expect(
      evaluatePhotoReadiness(observation({ width: 1_500, height: 900 })),
    ).toMatchObject({ reason: "not-portrait" });

    const cropped = fullBodyPose();
    cropped[27] = { ...cropped[27]!, y: 1 };
    expect(
      evaluatePhotoReadiness(observation({ poses: [cropped] })),
    ).toMatchObject({ reason: "person-cropped" });

    const crossed = fullBodyPose();
    crossed[15] = { x: 0.55, y: 0.31, visibility: 0.98 };
    crossed[16] = { x: 0.45, y: 0.31, visibility: 0.98 };
    expect(
      evaluatePhotoReadiness(observation({ poses: [crossed] })),
    ).toMatchObject({ reason: "torso-obscured" });

    expect(evaluatePhotoReadiness(observation({ sharpness: 2 }))).toMatchObject({
      reason: "too-blurry",
    });
  });

  // A person standing far from the camera passes every landmark-visibility
  // check but gives the model too few garment pixels to work from.
  it("rejects a subject that is too small in frame", () => {
    const distant = fullBodyPose();
    // Compress the whole body into the middle of the frame: every landmark is
    // still visible and in frame, but the head-to-foot span drops under the
    // 0.55 minimum body-height ratio.
    for (let index = 0; index < distant.length; index += 1) {
      const point = distant[index]!;
      if ((point.visibility ?? 0) < 0.5) continue;
      distant[index] = { ...point, y: 0.4 + (point.y - 0.08) * 0.2 };
    }

    expect(
      evaluatePhotoReadiness(observation({ poses: [distant] })),
    ).toMatchObject({ reason: "person-too-small" });
  });

  it("rejects a subject whose shoulders span too few pixels", () => {
    const narrow = fullBodyPose();
    narrow[11] = { x: 0.49, y: 0.22, visibility: 0.98 };
    narrow[12] = { x: 0.51, y: 0.22, visibility: 0.98 };

    // 0.02 * 900px = 18px, under the 55px minimum shoulder width.
    expect(
      evaluatePhotoReadiness(observation({ poses: [narrow] })),
    ).toMatchObject({ reason: "person-too-small" });
  });
});
