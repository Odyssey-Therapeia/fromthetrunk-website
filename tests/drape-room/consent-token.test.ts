import { describe, expect, it } from "vitest";

import {
  issueTryonConsentToken,
  inspectTryonConsentToken,
  TRYON_CONSENT_TOKEN_HEADER,
  TRYON_CONSENT_TOKEN_TTL_MS,
  verifyTryonConsentToken,
  type TryonConsentIdentity,
} from "@/lib/drape-room/security/consent-token";
import { issueTryonSession } from "@/lib/drape-room/security/session";
import {
  readDrapeRoomConfig,
  type DrapeRoomEnvironment,
  type EnabledDrapeRoomConfig,
} from "@/lib/drape-room/server/config";

const NOW = 1_800_000_000_000;
const secret = (label: string) => `${label}-${"x".repeat(40)}`;

function enabledConfig(
  overrides: DrapeRoomEnvironment = {},
): EnabledDrapeRoomConfig {
  const config = readDrapeRoomConfig({
    FTT_PRIVACY_POLICY_VERSION: "2026-08-ai-v1",
    FTT_TRYON_ALLOWED_ORIGINS: "https://www.fromthetrunk.shop",
    FTT_TRYON_DISCLOSURE_VERSION: "provider-disclosure-v1",
    FTT_TRYON_ENABLED: "true",
    FTT_TRYON_ENGINE_VERSION: "storefront-v1",
    FTT_TRYON_GOOGLE_API_KEY: "test-key-never-used",
    FTT_TRYON_HMAC_SECRET: secret("hmac"),
    FTT_TRYON_IP_HASH_SECRET: secret("ip"),
    FTT_TRYON_MODEL: "gemini-3.1-flash-image",
    FTT_TRYON_MONTHLY_LIMIT_MICRO_USD: "5000000",
    FTT_TRYON_OUTPUT_VERSION: "jpeg-1k-v1",
    FTT_TRYON_PROMPT_VERSION: "nivi-v4",
    FTT_TRYON_PROVIDER: "google",
    FTT_TRYON_PROVIDER_TIMEOUT_MS: "210000",
    FTT_TRYON_SESSION_SECRET: secret("session"),
    NODE_ENV: "test",
    ...overrides,
  });
  if (!config.enabled) throw new Error("expected enabled test config");
  return config;
}

function sessionNonce(config: EnabledDrapeRoomConfig): string {
  const session = issueTryonSession(config.sessionSecret, undefined, NOW);
  if (!session) throw new Error("expected session");
  return session.nonce;
}

function tokenFor(config: EnabledDrapeRoomConfig, nonce: string): string {
  const token = issueTryonConsentToken(
    config,
    config.hmacSecret,
    nonce,
    NOW,
  );
  if (!token) throw new Error("expected consent token");
  return token;
}

describe("Drape Room consent token", () => {
  it("is opaque, bounded, session-bound, and valid for exactly five minutes", () => {
    const config = enabledConfig();
    const nonce = sessionNonce(config);
    const token = tokenFor(config, nonce);

    expect(TRYON_CONSENT_TOKEN_HEADER).toBe("X-FTT-Tryon-Consent-Token");
    expect(token).toMatch(/^v1\.\d{13}\.\d{13}\.[A-Za-z0-9_-]{43}$/);
    expect(token).toHaveLength(74);
    expect(token).not.toContain(nonce);
    expect(token).not.toContain(config.provider);
    expect(token).not.toContain(config.model);
    expect(
      verifyTryonConsentToken(
        config,
        config.hmacSecret,
        nonce,
        token,
        NOW + TRYON_CONSENT_TOKEN_TTL_MS - 1,
      ),
    ).toBe(true);
    expect(
      verifyTryonConsentToken(
        config,
        config.hmacSecret,
        nonce,
        token,
        NOW + TRYON_CONSENT_TOKEN_TTL_MS,
      ),
    ).toBe(false);
  });

  it("rejects missing, malformed, tampered, expired, and other-session tokens", () => {
    const config = enabledConfig();
    const nonce = sessionNonce(config);
    const token = tokenFor(config, nonce);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const otherNonce = sessionNonce(config);

    for (const candidate of [
      undefined,
      "",
      ` ${token}`,
      `${token} `,
      `${token}.extra`,
      tampered,
    ]) {
      expect(
        verifyTryonConsentToken(
          config,
          config.hmacSecret,
          nonce,
          candidate,
          NOW,
        ),
      ).toBe(false);
    }
    expect(
      verifyTryonConsentToken(
        config,
        config.hmacSecret,
        nonce,
        token,
        NOW + TRYON_CONSENT_TOKEN_TTL_MS,
      ),
    ).toBe(false);
    expect(
      verifyTryonConsentToken(
        config,
        config.hmacSecret,
        otherNonce,
        token,
        NOW,
      ),
    ).toBe(false);
    expect(
      inspectTryonConsentToken(
        config,
        config.hmacSecret,
        nonce,
        token,
        NOW + TRYON_CONSENT_TOKEN_TTL_MS,
      ),
    ).toEqual({ valid: false, reason: "expired" });
    expect(
      inspectTryonConsentToken(
        config,
        config.hmacSecret,
        otherNonce,
        token,
        NOW,
      ),
    ).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("invalidates on every provider, disclosure, privacy, and render identity change", () => {
    const config = enabledConfig();
    const nonce = sessionNonce(config);
    const token = tokenFor(config, nonce);
    const changedIdentities: TryonConsentIdentity[] = [
      { ...config, provider: "openai" },
      { ...config, model: "gpt-image-2" },
      { ...config, disclosureVersion: "provider-disclosure-v2" },
      { ...config, privacyPolicyVersion: "2026-09-ai-v2" },
      { ...config, promptVersion: "nivi-v5" },
      { ...config, referenceContractVersion: "gallery-v3" },
      { ...config, engineVersion: "storefront-v2" },
      { ...config, outputVersion: "jpeg-1k-v2" },
      {
        ...config,
        disclosure: {
          ...config.disclosure,
          retentionSummary: `${config.disclosure.retentionSummary} Changed.`,
        },
      },
    ];

    for (const changed of changedIdentities) {
      expect(
        verifyTryonConsentToken(
          changed,
          config.hmacSecret,
          nonce,
          token,
          NOW,
        ),
      ).toBe(false);
    }
  });
});
