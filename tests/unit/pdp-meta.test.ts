import { describe, expect, it } from "vitest";

import {
  buildPdpTitle,
  buildPdpDescription,
} from "@/lib/seo/pdp-meta";

// ---------------------------------------------------------------------------
// buildPdpTitle — format: `{name} – Pre-Loved {fabric} Saree`
// (the " | From The Trunk" brand segment is appended by the layout template)
// ---------------------------------------------------------------------------

describe("buildPdpTitle", () => {
  it("appends the suffix (en-dash separated) when the name does NOT already end in '{fabric} saree'", () => {
    const title = buildPdpTitle("Temple Border Archive", "Kanjeevaram silk");
    expect(title).toBe("Temple Border Archive – Pre-Loved Kanjeevaram silk Saree");
  });

  it("keeps the product name (does not collapse to a fabric-only title)", () => {
    const title = buildPdpTitle("Forest & Flame Tie Dye", "Silk");
    expect(title).toContain("Forest & Flame Tie Dye");
    expect(title).toBe("Forest & Flame Tie Dye – Pre-Loved Silk Saree");
  });

  it("skips the suffix when the name ends in '{fabric} Saree' (case-insensitive match)", () => {
    const title = buildPdpTitle("Temple Border Kanjeevaram silk Saree", "Kanjeevaram silk");
    expect(title).toBe("Temple Border Kanjeevaram silk Saree");
  });

  it("skips the suffix when the name ends with lowercase 'saree'", () => {
    const title = buildPdpTitle("Vintage Cotton saree", "Cotton");
    expect(title).toBe("Vintage Cotton saree");
  });

  it("skips the suffix when the name ends with mixed-case 'SAREE'", () => {
    const title = buildPdpTitle("Bridal Banarasi silk SAREE", "Banarasi silk");
    expect(title).toBe("Bridal Banarasi silk SAREE");
  });

  it("does not add the brand segment (layout handles that)", () => {
    const title = buildPdpTitle("Heritage Linen Drape", "Linen");
    expect(title).not.toContain("From The Trunk");
  });

  it("strips trailing 'saree' from fabric value to avoid double-saree output", () => {
    const title = buildPdpTitle("Heirloom Beauty", "Heirloom saree");
    expect(title).toBe("Heirloom Beauty – Pre-Loved Heirloom Saree");
  });

  it("strips trailing 'SAREE' (case-insensitive) from fabric value", () => {
    const title = buildPdpTitle("Vintage Drape", "Cotton SAREE");
    expect(title).toBe("Vintage Drape – Pre-Loved Cotton Saree");
  });
});

// ---------------------------------------------------------------------------
// buildPdpDescription — SOT template:
//   Own '{name}', a one-of-a-kind pre-loved {fabric} saree authenticated by
//   From The Trunk. {one-line story}. Shipped with provenance.
// ---------------------------------------------------------------------------

const NO_STORY =
  "Own 'Aardha', a one-of-a-kind pre-loved Silk saree authenticated by From The Trunk. Shipped with provenance.";

describe("buildPdpDescription", () => {
  it("wraps the SOT template around name + fabric when there is no story", () => {
    expect(buildPdpDescription("Aardha", "Silk", null, null)).toBe(NO_STORY);
  });

  it("omits the story sentence when both story sources are empty strings", () => {
    expect(buildPdpDescription("Aardha", "Silk", "", "")).toBe(NO_STORY);
  });

  it("includes the one-line story when it fits", () => {
    const desc = buildPdpDescription("Aardha", "Silk", "A monsoon-wedding heirloom");
    expect(desc).toBe(
      "Own 'Aardha', a one-of-a-kind pre-loved Silk saree authenticated by From The Trunk. A monsoon-wedding heirloom. Shipped with provenance.",
    );
  });

  it("uses storyTitle as the one-line story when the narrative is absent", () => {
    const desc = buildPdpDescription("Aardha", "Silk", null, "A quiet Sunday drape");
    expect(desc).toContain("A quiet Sunday drape.");
    expect(desc.endsWith("Shipped with provenance.")).toBe(true);
  });

  it("embeds the product name so the description is unique per product", () => {
    const a = buildPdpDescription("Aardha", "Silk", null, null);
    const b = buildPdpDescription("Bela", "Silk", null, null);
    expect(a).toContain("'Aardha'");
    expect(b).toContain("'Bela'");
    expect(a).not.toBe(b);
  });

  it("truncates a long story at a word boundary and stays around 155 chars", () => {
    const longStory =
      "Woven over many months by artisans in a small weaving village, this drape carries motifs handed down through several generations of one family";
    const desc = buildPdpDescription("Aardha", "Silk", longStory);
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(
      desc.startsWith(
        "Own 'Aardha', a one-of-a-kind pre-loved Silk saree authenticated by From The Trunk.",
      ),
    ).toBe(true);
    expect(desc.endsWith(". Shipped with provenance.")).toBe(true);
    // Word-boundary truncation never emits a partial word from the story.
    const storyClause = desc
      .replace(
        "Own 'Aardha', a one-of-a-kind pre-loved Silk saree authenticated by From The Trunk. ",
        "",
      )
      .replace(". Shipped with provenance.", "");
    expect(longStory.startsWith(storyClause)).toBe(true);
  });

  it("strips a trailing 'saree' from the fabric value (no double 'saree')", () => {
    const desc = buildPdpDescription("Aardha", "Heirloom saree", null, null);
    expect(desc).toContain("pre-loved Heirloom saree authenticated");
    expect(desc).not.toContain("Heirloom saree saree");
  });
});
