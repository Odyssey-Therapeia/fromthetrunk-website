import { describe, expect, it } from "vitest";

import {
  buildClassicNiviPrompt,
  CLASSIC_NIVI_PROMPT_VERSION,
  DRAPE_BACKGROUNDS,
} from "@/lib/drape-room/server/prompt";

describe("Classic Nivi prompt", () => {
  it("locks the only selectable axis and prompt version", () => {
    const prompt = buildClassicNiviPrompt("festival");
    const headings = prompt
      .split("\n")
      .filter((line) => /^[A-Z ]+$/.test(line) && line.length > 3);

    expect({
      backgrounds: DRAPE_BACKGROUNDS,
      headings,
      promptVersion: CLASSIC_NIVI_PROMPT_VERSION,
    }).toMatchInlineSnapshot(`
      {
        "backgrounds": [
          "studio",
          "festival",
          "wedding",
          "party",
          "birthday",
        ],
        "headings": [
          "CLASSIC NIVI DRAPE",
          "PRESERVE THE PERSON",
          "PRESERVE THE PRODUCT",
          "REALISM",
          "BACKGROUND",
          "DO NOT",
        ],
        "promptVersion": "nivi-v3",
      }
    `);
  });

  it("pins identity, fabric fidelity, Nivi topology, and one-image output", () => {
    const prompt = buildClassicNiviPrompt("wedding");

    expect(prompt).toContain("five to seven crisp front knife pleats");
    expect(prompt).toContain("diagonally across the front torso");
    expect(prompt).toContain("LEFT shoulder");
    expect(prompt).toContain("Preserve the subject's face exactly");
    expect(prompt).toContain("exactly three reference images");
    expect(prompt).toContain("IMAGE 2 is the strongest full-look");
    expect(prompt).toContain("IMAGE 3 is a complementary detail reference");
    expect(prompt).toContain("Both product images are textile sources only");
    expect(prompt).toContain("Never copy or blend any human identity");
    expect(prompt).toContain("Match every generated area of exposed body skin continuously to the face");
    expect(prompt).toContain("pose, and camera-perspective cue that is actually visible");
    expect(prompt).toContain("body or lower body is not visible");
    expect(prompt).toContain("Reproduce the border exactly");
    expect(prompt).toContain("Reproduce the pallu's distinct design");
    expect(prompt).toContain("exact hue, saturation, tonal depth");
    expect(prompt).toContain("Indian wedding venue");
    expect(prompt).toContain("do not automatically portray the customer as the bride");
    expect(prompt).toContain("background decor, props, or lighting obstruct");
    expect(prompt).toContain("Return only the final image");
    expect(prompt).not.toContain("ADDITIONAL INSTRUCTIONS");
  });

  it("rejects a background outside the fixed enum", () => {
    expect(() =>
      buildClassicNiviPrompt("outdoor" as never),
    ).toThrow("invalid_drape_background");
  });

  it("keeps birthday decor free of readable personal text", () => {
    expect(buildClassicNiviPrompt("birthday")).toContain(
      "without readable banners, names, numbers, ages, text, or logos",
    );
  });
});
