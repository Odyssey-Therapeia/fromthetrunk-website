import { describe, expect, it } from "vitest";

import {
  evaluatePhotoReadiness,
  PHOTO_READINESS_POLICY_VERSION,
  type PhotoReadinessObservation,
  type ReadinessPoseLandmark,
} from "@/lib/drape-room/client/photo-readiness-policy";

function emptyPose(): ReadinessPoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
}

function withPoints(
  entries: ReadonlyArray<readonly [number, number, number]>,
): ReadinessPoseLandmark[] {
  const pose = emptyPose();
  for (const [index, x, y] of entries) {
    pose[index] = { x, y, visibility: 0.98 };
  }
  return pose;
}

/** Head plus a complete body, head to ankles. */
function fullBodyPose(): ReadinessPoseLandmark[] {
  return withPoints([
    [0, 0.5, 0.08],
    [2, 0.47, 0.1],
    [5, 0.53, 0.1],
    [11, 0.4, 0.22],
    [12, 0.6, 0.22],
    [23, 0.43, 0.5],
    [24, 0.57, 0.5],
    [25, 0.44, 0.7],
    [26, 0.56, 0.7],
    [27, 0.45, 0.9],
    [28, 0.55, 0.9],
  ]);
}

/** A face filling the frame: no shoulders, hips, knees, or feet at all. */
function headshotPose(): ReadinessPoseLandmark[] {
  return withPoints([
    [0, 0.5, 0.45],
    [2, 0.42, 0.35],
    [5, 0.58, 0.35],
    [7, 0.3, 0.38],
    [8, 0.7, 0.38],
    [9, 0.46, 0.56],
    [10, 0.54, 0.56],
  ]);
}

/** A full-length pose facing away: body visible, no face landmarks at all. */
function facelessBodyPose(): ReadinessPoseLandmark[] {
  return withPoints([
    [11, 0.4, 0.22],
    [12, 0.6, 0.22],
    [23, 0.43, 0.5],
    [24, 0.57, 0.5],
    [25, 0.44, 0.7],
    [26, 0.56, 0.7],
    [27, 0.45, 0.9],
    [28, 0.55, 0.9],
  ]);
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

const ready = {
  ready: true,
  policyVersion: PHOTO_READINESS_POLICY_VERSION,
};

describe("Drape Room photo readiness policy", () => {
  it("accepts a full-body portrait", () => {
    expect(evaluatePhotoReadiness(observation())).toEqual(ready);
  });

  it("accepts a face-only headshot with no body visible", () => {
    expect(
      evaluatePhotoReadiness(observation({ poses: [headshotPose()] })),
    ).toEqual(ready);
  });

  it("accepts a full-length pose with no face visible", () => {
    expect(
      evaluatePhotoReadiness(observation({ poses: [facelessBodyPose()] })),
    ).toEqual(ready);
  });

  it("accepts an upper-body crop", () => {
    const upperBody = withPoints([
      [0, 0.5, 0.15],
      [2, 0.46, 0.18],
      [5, 0.54, 0.18],
      [11, 0.35, 0.45],
      [12, 0.65, 0.45],
    ]);
    expect(
      evaluatePhotoReadiness(observation({ poses: [upperBody] })),
    ).toEqual(ready);
  });

  it("accepts a landscape photo", () => {
    expect(
      evaluatePhotoReadiness(observation({ width: 1_600, height: 900 })),
    ).toEqual(ready);
  });

  it("accepts a subject touching the frame edge", () => {
    const cropped = fullBodyPose();
    cropped[27] = { x: 0.45, y: 1, visibility: 0.98 };
    cropped[28] = { x: 0.55, y: 1, visibility: 0.98 };
    expect(
      evaluatePhotoReadiness(observation({ poses: [cropped] })),
    ).toEqual(ready);
  });

  it("accepts arms crossed over the torso", () => {
    const crossed = fullBodyPose();
    crossed[15] = { x: 0.55, y: 0.31, visibility: 0.98 };
    crossed[16] = { x: 0.45, y: 0.31, visibility: 0.98 };
    expect(
      evaluatePhotoReadiness(observation({ poses: [crossed] })),
    ).toEqual(ready);
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

  it("rejects a pose with no usable landmark", () => {
    expect(
      evaluatePhotoReadiness(observation({ poses: [emptyPose()] })),
    ).toMatchObject({ reason: "no-person" });
  });

  it("rejects an unusable image size", () => {
    expect(
      evaluatePhotoReadiness(observation({ width: 0, height: 0 })),
    ).toMatchObject({ reason: "no-person" });
    expect(
      evaluatePhotoReadiness(observation({ height: Number.NaN })),
    ).toMatchObject({ reason: "no-person" });
  });

  it("rejects a person who is a speck in the frame", () => {
    const distant = withPoints([
      [0, 0.5, 0.5],
      [11, 0.49, 0.52],
      [12, 0.51, 0.52],
      [27, 0.49, 0.55],
      [28, 0.51, 0.55],
    ]);
    // Spans 18px wide and 60px tall against a 1200px frame: under the 10% floor.
    expect(
      evaluatePhotoReadiness(observation({ poses: [distant] })),
    ).toMatchObject({ reason: "person-too-small" });
  });

  it("rejects severe blur", () => {
    expect(evaluatePhotoReadiness(observation({ sharpness: 2 }))).toMatchObject({
      reason: "too-blurry",
    });
    expect(
      evaluatePhotoReadiness(observation({ sharpness: Number.NaN })),
    ).toMatchObject({ reason: "too-blurry" });
  });

  it("no longer pins the caller to a full-body framing", () => {
    expect(PHOTO_READINESS_POLICY_VERSION).toBe("person-present-v2");
  });
});
