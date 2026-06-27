import { describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { shouldExposeApiDocs } from "@/lib/http/api-docs-policy";
import {
  getMissingProductionTokenSecrets,
  getTokenSecret,
} from "@/lib/security/token-secrets";
import { POST as cspReportPost } from "@/app/api/csp-report/route";

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
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("accepts CSP reports without logging or persisting request bodies", async () => {
    const response = await cspReportPost();
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
