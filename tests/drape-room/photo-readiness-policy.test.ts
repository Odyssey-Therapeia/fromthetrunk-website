import { describe, expect, it } from "vitest";

import {
  evaluatePhotoReadiness,
  PHOTO_READINESS_POLICY_VERSION,
  type PhotoReadinessObservation,
} from "@/lib/drape-room/client/photo-readiness-policy";

function observation(
  overrides: Partial<PhotoReadinessObservation> = {},
): PhotoReadinessObservation {
  return {
    width: 900,
    height: 1_200,
    faces: [{ x: 390, y: 54, width: 120, height: 145 }],
    sharpness: 80,
    ...overrides,
  };
}

describe("Drape Room visible-face photo readiness policy", () => {
  it("accepts a clear single face without body landmarks", () => {
    expect(evaluatePhotoReadiness(observation())).toEqual({
      ready: true,
      policyVersion: PHOTO_READINESS_POLICY_VERSION,
    });
  });

  it("accepts landscape, headshot, profile, covered-body, and body-free inputs", () => {
    expect(
      evaluatePhotoReadiness(observation({ width: 1_200, height: 900 })),
    ).toEqual({
      ready: true,
      policyVersion: PHOTO_READINESS_POLICY_VERSION,
    });
  });

  it("blocks a missing or ambiguous face", () => {
    expect(evaluatePhotoReadiness(observation({ faces: [] }))).toMatchObject({
      reason: "no-face",
    });
    expect(
      evaluatePhotoReadiness(
        observation({
          faces: [
            { x: 390, y: 54, width: 120, height: 145 },
            { x: 100, y: 80, width: 100, height: 120 },
          ],
        }),
      ),
    ).toMatchObject({ reason: "multiple-faces" });
  });

  it("blocks a tiny, cropped, or blurry face", () => {
    expect(
      evaluatePhotoReadiness(
        observation({ faces: [{ x: 430, y: 70, width: 40, height: 50 }] }),
      ),
    ).toMatchObject({ reason: "face-too-small" });
    expect(
      evaluatePhotoReadiness(
        observation({ faces: [{ x: 0, y: 20, width: 120, height: 145 }] }),
      ),
    ).toMatchObject({ reason: "face-cropped" });
    expect(evaluatePhotoReadiness(observation({ sharpness: 2 }))).toMatchObject({
      reason: "too-blurry",
    });
  });
});
