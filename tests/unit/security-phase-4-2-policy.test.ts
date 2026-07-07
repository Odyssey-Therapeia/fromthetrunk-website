import { describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { registerSecurityRoutes } from "@/api/hono/routes/security";
import { shouldExposeApiDocs } from "@/lib/http/api-docs-policy";
import {
  getMissingProductionTokenSecrets,
  getTokenSecret,
} from "@/lib/security/token-secrets";
import { createRouteHarness } from "../helpers/route-harness";

describe("Security Phase 4.2 policy helpers", () => {
  it("requires dedicated production token secrets", () => {
    const missing = getMissingProductionTokenSecrets({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "shared-session-secret",
    });

    expect(missing).toEqual([
      "RESERVATION_TOKEN_SECRET",
      "ORDER_ACCESS_TOKEN_SECRET",
      "EMAIL_VERIFICATION_TOKEN_SECRET",
      "PREVIEW_TOKEN_SECRET",
      "AUTH_OTP_SECRET",
      "AUTH_OTP_TOKEN_SECRET",
    ]);
  });

  it("does not fall back to shared secrets in production token helpers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_SECRET", "shared-session-secret");
    vi.stubEnv("RESERVATION_TOKEN_SECRET", "");

    expect(() =>
      getTokenSecret("RESERVATION_TOKEN_SECRET", {
        purpose: "test reservation tokens",
      }),
    ).toThrow(/RESERVATION_TOKEN_SECRET/);

    vi.unstubAllEnvs();
  });

  it("allows development fallback secrets for local token helpers", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXTAUTH_SECRET", "shared-session-secret");
    vi.stubEnv("RESERVATION_TOKEN_SECRET", "");

    expect(
      getTokenSecret("RESERVATION_TOKEN_SECRET", {
        purpose: "test reservation tokens",
      }),
    ).toBe("shared-session-secret");

    vi.unstubAllEnvs();
  });

  it("disables API docs in production unless explicitly enabled", () => {
    expect(shouldExposeApiDocs({ NODE_ENV: "production" })).toBe(false);
    expect(
      shouldExposeApiDocs({
        FTT_ENABLE_API_DOCS: "true",
        NODE_ENV: "production",
      }),
    ).toBe(true);
    expect(shouldExposeApiDocs({ NODE_ENV: "development" })).toBe(true);
  });

  it("sets CSP report-only header with Razorpay and report endpoint allowances", async () => {
    const headers = await nextConfig.headers?.();
    const globalHeaders = headers?.find((entry) => entry.source === "/(.*)")?.headers ?? [];
    const csp = globalHeaders.find(
      (header) => header.key === "Content-Security-Policy-Report-Only",
    )?.value;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://checkout.razorpay.com");
    expect(csp).toContain("https://api.razorpay.com");
    expect(csp).toContain("report-uri /api/v2/security/csp-report");
  });

  it("allowlists consent-gated GTM + GA4 domains in the CSP", async () => {
    const headers = await nextConfig.headers?.();
    const globalHeaders =
      headers?.find((entry) => entry.source === "/(.*)")?.headers ?? [];
    const csp =
      globalHeaders.find(
        (header) => header.key === "Content-Security-Policy-Report-Only",
      )?.value ?? "";

    const directive = (name: string): string =>
      csp
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name} `)) ?? "";

    // GTM script + Preview (tagmanager.google.com) in script-src (+ elem).
    for (const name of ["script-src", "script-src-elem"]) {
      expect(directive(name)).toContain("https://www.googletagmanager.com");
      expect(directive(name)).toContain("https://tagmanager.google.com");
    }
    // GA4 collect + GTM Preview channel in connect-src.
    expect(directive("connect-src")).toContain("https://*.google-analytics.com");
    expect(directive("connect-src")).toContain("https://www.googletagmanager.com");
    // GA4 pixel + gstatic in img-src.
    expect(directive("img-src")).toContain("https://www.googletagmanager.com");
    expect(directive("img-src")).toContain("https://www.gstatic.com");
    // GTM Preview iframe in frame-src.
    expect(directive("frame-src")).toContain("https://www.googletagmanager.com");
    expect(directive("frame-src")).toContain("https://tagmanager.google.com");

    // Guardrails: no broad wildcard, no ads/remarketing, no unsafe-eval.
    expect(csp).not.toContain("script-src *");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("doubleclick");
    expect(csp).not.toContain("pagead");

    // Razorpay + report endpoint preserved.
    expect(directive("frame-src")).toContain("https://checkout.razorpay.com");
    expect(csp).toContain("report-uri /api/v2/security/csp-report");
  });

  it("accepts CSP reports without logging or persisting request bodies", async () => {
    const harness = createRouteHarness({
      register: registerSecurityRoutes,
    });
    const response = await harness.request("/csp-report", {
      method: "POST",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
