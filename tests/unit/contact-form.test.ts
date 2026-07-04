import { describe, expect, it } from "vitest";

import {
  buildContactSubmitPayload,
  CONTACT_TOPIC_OPTIONS,
  CONTACT_WIZARD_STEPS,
  emptyContactWizardState,
  isContactStepValid,
  isValidEmail,
  sanitizePhone,
  type ContactWizardState,
} from "@/lib/contact/contact-form";

const complete: ContactWizardState = {
  topic: "Buying a saree",
  name: "Aria",
  email: "aria@example.com",
  phone: "+91 98765 43210",
  message: "I am looking for a restored Kanjivaram for a wedding.",
  website: "",
};

describe("contact wizard — topic options", () => {
  it("exposes exactly the six intents", () => {
    expect(CONTACT_TOPIC_OPTIONS).toHaveLength(6);
    expect(CONTACT_TOPIC_OPTIONS.map((o) => o.label)).toEqual([
      "I want to buy a saree",
      "I want to sell or share a saree",
      "I need help with an order",
      "I want styling or fabric guidance",
      "Partnership / press",
      "Something else",
    ]);
    // topic values stay within the backend max (80).
    for (const o of CONTACT_TOPIC_OPTIONS) expect(o.value.length).toBeLessThanOrEqual(80);
  });
});

describe("contact wizard — step validation", () => {
  it("starts invalid and gates each required step", () => {
    const s = emptyContactWizardState();
    expect(isContactStepValid(0, s)).toBe(false); // topic
    expect(isContactStepValid(0, { ...s, topic: "Order help" })).toBe(true);

    expect(isContactStepValid(1, { ...s, name: "A" })).toBe(false); // <2
    expect(isContactStepValid(1, { ...s, name: "Ab" })).toBe(true);

    expect(isContactStepValid(2, { ...s, email: "nope" })).toBe(false);
    expect(isContactStepValid(2, { ...s, email: "a@b.co" })).toBe(true);

    // phone is optional → step 3 valid when empty
    expect(isContactStepValid(3, s)).toBe(true);

    expect(isContactStepValid(4, { ...s, message: "too short" })).toBe(false); // <10
    expect(isContactStepValid(4, { ...s, message: "long enough message" })).toBe(true);
  });

  it("review step (last) requires all required fields", () => {
    const last = CONTACT_WIZARD_STEPS - 1;
    expect(isContactStepValid(last, complete)).toBe(true);
    expect(isContactStepValid(last, { ...complete, email: "bad" })).toBe(false);
    expect(isContactStepValid(last, { ...complete, message: "short" })).toBe(false);
  });

  it("validates emails conservatively", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });

  it("sanitizes phone to the backend-allowed charset and length", () => {
    expect(sanitizePhone("+91 (98) 765-43210")).toBe("+91 (98) 765-43210");
    expect(sanitizePhone("abc+1def2")).toBe("+12");
    expect(sanitizePhone("9".repeat(50)).length).toBe(32);
  });
});

describe("contact wizard — submit payload", () => {
  const payload = buildContactSubmitPayload(complete, {
    pagePath: "/how-it-works?x=1",
    startedAt: 1700000000000,
    clientSubmissionId: "cid-123",
  });

  it("preserves the exact backend contract incl. honeypot, startedAt, pagePath", () => {
    expect(payload.name).toBe("Aria");
    expect(payload.email).toBe("aria@example.com");
    expect(payload.message).toBe(complete.message);
    expect(payload.topic).toBe("Buying a saree");
    expect(payload.phone).toBe("+91 98765 43210");
    expect(payload).toHaveProperty("website", ""); // honeypot always present
    expect(payload).toHaveProperty("startedAt", 1700000000000);
    expect(payload).toHaveProperty("pagePath", "/how-it-works?x=1");
    expect(payload).toHaveProperty("clientSubmissionId", "cid-123");
  });

  it("omits optional phone/topic when empty", () => {
    const minimal = buildContactSubmitPayload(
      { ...emptyContactWizardState(), name: "Bee", email: "b@c.co", message: "hello there friend" },
      { pagePath: "/" },
    );
    expect(minimal).not.toHaveProperty("phone");
    expect(minimal).not.toHaveProperty("topic");
    expect(minimal).toHaveProperty("website", "");
    expect(minimal.pagePath).toBe("/");
  });
});
