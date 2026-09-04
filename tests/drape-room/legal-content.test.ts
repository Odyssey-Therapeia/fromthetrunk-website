import { describe, expect, it } from "vitest";

import { policies } from "@/lib/legal/policies";
import { FAQ_ITEMS, faqJsonLd } from "@/lib/seo/faq-content";

const DRAPE_ROOM_QUESTIONS = [
  "Does From the Trunk save the photo I use for AI try-on?",
  "How do I delete my virtual try-on photos?",
  "Why has my saved try-on disappeared?",
  "Is the AI try-on an exact representation of the saree?",
  "Will opening the same saree generate another image?",
  "Does changing the AI preview background use another generation?",
  "What happens when I replace my photo?",
] as const;

describe("Drape Room legal and FAQ content", () => {
  it("keeps the seven customer-facing answers and FAQ schema aligned", () => {
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

    expect(privacy?.lastUpdated).toBe("September 4, 2026");
    expect(copy).toContain("stored as local browser data");
    expect(copy).toContain("transiently through our hosting infrastructure");
    expect(copy).toContain("metadata-only record");
    expect(copy).toContain("locally stored previews");
    expect(copy).toContain("opens locally for free");
    expect(copy).toContain("using 1 generation");
    expect(copy).not.toContain("Regenerate action");
    expect(copy).toContain("illustrative preview");
    expect(copy).not.toContain("Zero Data Retention is guaranteed");
  });
});


const CONTACT_EMAIL = "hello@fromthetrunk.shop";

function policyFor(slug: string) {
  const policy = policies.find((candidate) => candidate.slug === slug);
  if (!policy) throw new Error(`Missing policy: ${slug}`);
  return policy;
}

function sectionText(slug: string, id: string): string {
  const section = policyFor(slug).sections.find(
    (candidate) => candidate.id === id,
  );
  if (!section) throw new Error(`Missing section ${slug}#${id}`);
  return section.body.join(" ");
}

describe("Privacy Policy data-rights content", () => {
  const privacy = policyFor("privacy-policy");
  const allText = privacy.sections
    .flatMap((section) => [section.title, ...section.body])
    .join(" ");

  it("uses the canonical contact address and never the misspelled domain", () => {
    expect(allText).toContain(CONTACT_EMAIL);
    expect(allText).not.toContain("fromthtetrunk");
    expect(allText).not.toContain("hello@fromthetrunk.com");
  });

  it("describes the Drape Room operational record and what it excludes", () => {
    const copy = sectionText("privacy-policy", "drape-room-operational-records");
    expect(copy).toContain("limited operational metadata");
    expect(copy).toContain("selected product");
    expect(copy).toContain("provider and model");
    expect(copy).toContain("sanitised error code");
    expect(copy).toContain(
      "does not contain your uploaded photograph or generated preview",
    );
    expect(copy).toContain("not persisted in From the Trunk's database or object storage");
    expect(copy).toContain("pseudonymous");
  });

  it("separates browser-held images from server-held metadata", () => {
    const copy = sectionText("privacy-policy", "browser-local-drape-room");
    expect(copy).toContain("stored locally in your browser");
    expect(copy).toContain("cannot retrieve these browser-local images");
    expect(copy).toContain("Clear my try-on data");
  });

  it("states access, correction, erasure, withdrawal, grievance and nomination", () => {
    const copy = sectionText("privacy-policy", "your-rights");
    expect(copy).toContain("request information about the personal data we process");
    expect(copy).toContain("correction, completion, or updating");
    expect(copy).toContain("erasure of personal data where applicable");
    expect(copy).toContain("withdraw consent for optional processing");
    expect(copy).toContain("raise a grievance");
    expect(copy).toContain("nominate another individual");
    expect(copy).toContain("death or incapacity");
  });

  it("explains how to submit a request and that identity is verified first", () => {
    const copy = sectionText("privacy-policy", "how-to-submit-a-request");
    expect(copy).toContain(CONTACT_EMAIL);
    expect(copy).toContain("Privacy Request");
    expect(copy).toContain("verify your identity and authority");
    expect(copy).toContain(
      "the period required by applicable law and our published grievance process",
    );
  });

  it("keeps identity verification in place even for an urgent concern", () => {
    const copy = sectionText("privacy-policy", "urgent-privacy-concern");
    expect(copy).toContain("Urgent Privacy Concern");
    expect(copy).toContain("we may still need to verify your identity");
    expect(copy).not.toContain("emergency access");
  });

  it("limits erasure instead of promising unconditional deletion", () => {
    const copy = sectionText("privacy-policy", "erasure-limitations");
    expect(copy).toContain(
      "does not necessarily require the deletion of every record",
    );
    expect(copy).toContain("tax or accounting obligations");
    expect(copy).toContain("restrict, minimise, or anonymise");
  });

  it("makes no DPDP claim the business cannot stand behind", () => {
    const lowered = allText.toLowerCase();
    expect(lowered).not.toContain("dpdp certified");
    expect(lowered).not.toContain("dpdp-certified");
    expect(lowered).not.toContain("emergency access");
    expect(lowered).not.toContain("all data can always be");
    expect(lowered).not.toContain("immediately delete");
    expect(lowered).not.toContain("instantly");
    // We must never claim we can reach provider-held or browser-held records.
    expect(lowered).not.toContain("delete your data from google");
  });
});

describe("Terms of Service data-rights content", () => {
  const terms = policyFor("terms-of-service");

  it("points at the Privacy Policy for data requests", () => {
    const copy = sectionText("terms-of-service", "privacy-and-data-requests");
    expect(copy).toContain("described in the Privacy Policy");
    expect(copy).toContain(CONTACT_EMAIL);
    expect(copy).toContain("verify your identity or authority");
    expect(copy).toContain("tax, accounting, fraud prevention");
  });

  it("states the Drape Room record position without duplicating the policy", () => {
    const copy = sectionText("terms-of-service", "ai-drape-room");
    expect(copy).toContain("illustrative styling visualisation");
    expect(copy).toContain("only a photograph you are entitled to use");
    expect(copy).toContain("limited metadata about an AI Drape Room request");
    expect(copy).toContain(
      "does not persist the customer photograph or generated preview",
    );
    // The Terms must not become a second copy of the Privacy Policy.
    const termsText = terms.sections.flatMap((s) => s.body).join(" ");
    expect(termsText).not.toContain("Information we collect");
    expect(termsText.length).toBeLessThan(
      policyFor("privacy-policy").sections.flatMap((s) => s.body).join(" ").length,
    );
  });

  it("promises no unconditional deletion", () => {
    const termsText = terms.sections.flatMap((s) => s.body).join(" ").toLowerCase();
    expect(termsText).toContain("erasure where applicable");
    expect(termsText).not.toContain("delete all your data");
    expect(termsText).not.toContain("permanently erase everything");
  });
});

describe("Legal placeholder blockers", () => {
  it("still carries the unresolved business placeholders, and no others", () => {
    const source = policies
      .flatMap((policy) => policy.sections.flatMap((section) => section.body))
      .join("\n");
    const placeholders = [...source.matchAll(/\[[A-Z][A-Z +]*\]/g)].map(
      (match) => match[0],
    );
    // These are manual public-production blockers, tracked in the final report.
    expect(new Set(placeholders)).toEqual(
      new Set([
        "[NAME]",
        "[DESIGNATION]",
        "[PHONE NUMBER]",
        "[REGISTERED ADDRESS]",
        "[REGISTERED BUSINESS ADDRESS]",
        "[GRIEVANCE EMAIL]",
        "[DAYS + HOURS]",
      ]),
    );
  });

  it("keeps no placeholder in the sections added for data rights", () => {
    for (const id of [
      "drape-room-operational-records",
      "your-rights",
      "how-to-submit-a-request",
      "urgent-privacy-concern",
      "erasure-limitations",
      "browser-local-drape-room",
    ]) {
      expect(sectionText("privacy-policy", id)).not.toMatch(/\[[A-Z]/);
    }
    for (const id of ["privacy-and-data-requests", "ai-drape-room"]) {
      expect(sectionText("terms-of-service", id)).not.toMatch(/\[[A-Z]/);
    }
  });
});
