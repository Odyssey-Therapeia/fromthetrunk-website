import { describe, expect, it } from "vitest";

import { policies } from "@/lib/legal/policies";
import { FAQ_ITEMS, faqJsonLd } from "@/lib/seo/faq-content";

const DRAPE_ROOM_QUESTIONS = [
  "Does From the Trunk save the photo I use for AI try-on?",
  "How do I delete my virtual try-on photos?",
  "Why has my saved try-on disappeared?",
  "Is the AI try-on an exact representation of the saree?",
  "Will opening the same saree generate another image?",
  "What happens when I replace my photo?",
] as const;

describe("Drape Room legal and FAQ content", () => {
  it("keeps the six customer-facing answers and FAQ schema aligned", () => {
    const answers = new Map(
      FAQ_ITEMS.map((item) => [item.question, item.answer] as const),
    );
    const schemaAnswers = new Map(
      faqJsonLd.mainEntity.map((item) => [
        item.name,
        item.acceptedAnswer.text,
      ] as const),
    );

    for (const question of DRAPE_ROOM_QUESTIONS) {
      expect(answers.get(question)).toBeTruthy();
      expect(schemaAnswers.get(question)).toBe(answers.get(question));
    }
  });

  it("states browser-local storage, transient processing, deletion, and limits", () => {
    const privacy = policies.find((policy) => policy.slug === "privacy-policy");
    const section = privacy?.sections.find(
      (candidate) => candidate.id === "ai-virtual-drape",
    );
    const copy = section?.body.join(" ") ?? "";

    expect(privacy?.lastUpdated).toBe("August 26, 2026");
    expect(copy).toContain("stored as local browser data");
    expect(copy).toContain("transiently through our hosting infrastructure");
    expect(copy).toContain("metadata-only record");
    expect(copy).toContain("locally stored previews");
    expect(copy).toContain("illustrative preview");
    expect(copy).not.toContain("Zero Data Retention is guaranteed");
  });
});
