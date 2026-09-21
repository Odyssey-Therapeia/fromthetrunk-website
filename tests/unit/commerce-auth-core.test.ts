/**
 * The auth core behind authenticated-first commerce.
 *
 * A shopper's first bag, wishlist or notify action signs them in with a code
 * sent to their email. Three properties have to hold for that to be usable and
 * safe: the popup's name reaches the account, an existing name is never
 * rewritten by it, and nobody is asked to sign in again a week later.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyOtpSchema } from "@/api/hono/schemas/auth-otp";

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const CHALLENGE = "c".repeat(40);

describe("OTP verify accepts the commerce popup's name", () => {
  it("takes a full name alongside the code", () => {
    const parsed = verifyOtpSchema.safeParse({
      challengeToken: CHALLENGE,
      fullName: "  Meera Nair  ",
      otp: "123456",
    });

    expect(parsed.success).toBe(true);
    // Trimmed, so a stray space never becomes the account's name.
    expect(parsed.success && parsed.data.fullName).toBe("Meera Nair");
  });

  it("stays optional, so ordinary account sign-in is unaffected", () => {
    const parsed = verifyOtpSchema.safeParse({
      challengeToken: CHALLENGE,
      otp: "123456",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.fullName).toBeUndefined();
  });

  it("rejects a blank or oversized name rather than storing it", () => {
    for (const fullName of ["", "   ", "x".repeat(121)]) {
      expect(
        verifyOtpSchema.safeParse({
          challengeToken: CHALLENGE,
          fullName,
          otp: "123456",
        }).success,
      ).toBe(false);
    }
  });

  it("still refuses unknown keys", () => {
    // The schema is .strict(); a typo must fail loudly, not be swallowed.
    expect(
      verifyOtpSchema.safeParse({
        challengeToken: CHALLENGE,
        fullname: "Meera Nair",
        otp: "123456",
      }).success,
    ).toBe(false);
  });
});

describe("account creation from a verified code", () => {
  const route = source("api/hono/routes/auth-otp.ts");

  it("records the supplied name on a brand-new customer", () => {
    expect(route).toContain("...(name ? { name } : {})");
    expect(route).toContain('role: "customer"');
  });

  it("fills a blank name but never replaces one", () => {
    // A name set in the profile must survive whatever is typed into a popup.
    expect(route).toContain("if (name && !existing.name?.trim())");
    expect(route).toContain("isNull(users.name)");
  });

  it("passes the popup's name through from the verified request", () => {
    expect(route).toContain("body.fullName");
  });

  it("keeps the flow enumeration-safe", () => {
    // The name only reaches the database after the code is proven, so nothing
    // reveals whether an account existed beforehand.
    const createIndex = route.indexOf("const createOrLoadEmailOtpCustomer");
    const callIndex = route.indexOf("createOrLoadEmailOtpCustomer(", createIndex + 10);
    const verifiedIndex = route.lastIndexOf("markOtpChallengeVerified", callIndex);

    expect(verifiedIndex).toBeGreaterThan(0);
    expect(verifiedIndex).toBeLessThan(callIndex);
  });
});

describe("session lifetime", () => {
  const options = source("lib/auth/options.ts");

  it("keeps a shopper signed in for thirty days", () => {
    expect(options).toContain("maxAge: 30 * 24 * 60 * 60");
    expect(options).toContain('strategy: "jwt"');
  });

  it("states the JWT lifetime too, rather than inheriting it", () => {
    const jwtBlock = options.slice(options.indexOf("jwt: {"));
    expect(jwtBlock.slice(0, 80)).toContain("maxAge");
  });
});
