import { describe, expect, it } from "vitest";
import { parseConsent } from "@/lib/analytics/consent";

/**
 * Consent parsing — opt-in model. Anything that is not the explicit "all"
 * value must fall back to "essential" so tracking never silently turns on.
 */
describe("consent parsing", () => {
  it("returns 'all' only for the literal 'all'", () => {
    expect(parseConsent("all")).toBe("all");
  });

  it("returns 'essential' for undefined", () => {
    expect(parseConsent(undefined)).toBe("essential");
  });

  it("returns 'essential' for empty string", () => {
    expect(parseConsent("")).toBe("essential");
  });

  it("returns 'essential' for unknown values (no silent opt-in)", () => {
    expect(parseConsent("yes")).toBe("essential");
    expect(parseConsent("true")).toBe("essential");
    expect(parseConsent("1")).toBe("essential");
  });
});
