import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TRYON_CONSENT_TOKEN_HEADER,
  verifyTryonConsentToken,
} from "@/lib/drape-room/security/consent-token";
import { verifyTryonSession } from "@/lib/drape-room/security/session";
import {
  DrapeRoomConfigError,
  FTT_TRYON_ENV_NAMES,
  readDrapeRoomConfig,
  type DrapeRoomEnvironment,
} from "@/lib/drape-room/server/config";
import { handleTryonConfigRequest } from "@/lib/drape-room/server/config-response";

const secret = (label: string) => `${label}-${"x".repeat(40)}`;

export const enabledTryonEnv = (
  overrides: DrapeRoomEnvironment = {},
): DrapeRoomEnvironment => ({
  FTT_PRIVACY_POLICY_VERSION: "2026-08-ai-v1",
  FTT_TRYON_ALLOWED_ORIGINS: "https://www.fromthetrunk.shop",
  FTT_TRYON_DISCLOSURE_VERSION: "provider-disclosure-v1",
  FTT_TRYON_ENABLED: "true",
  FTT_TRYON_ENGINE_VERSION: "storefront-v1",
  FTT_TRYON_GOOGLE_API_KEY: "server-google-key",
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

describe("Drape Room server configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("is disabled by default and returns only a complete redacted public shape", () => {
    const config = readDrapeRoomConfig({});
    expect(config.enabled).toBe(false);
    expect(config.publicConfig).toEqual({
      aspectRatio: "3:4",
      disclosureVersion: "provider-disclosure-v1",
      enabled: false,
      engineVersion: "storefront-v1",
      imageSize: "1K",
      model: "gemini-3.1-flash-image",
      outputMimeType: "image/jpeg",
      outputVersion: "jpeg-1k-v1",
      privacyPolicyVersion: "2026-08-ai-v1",
      promptVersion: "nivi-v4",
      referenceContractVersion: "gallery-v2",
      provider: "google",
      providerDisplayName: "Google Gemini",
      providerPolicyUrl: "https://ai.google.dev/gemini-api/terms",
      providerRetentionSummary: expect.any(String),
    });
  });

  it("accepts only the exact allowlisted provider/model pairs", () => {
    const google = readDrapeRoomConfig(enabledTryonEnv());
    expect(google).toMatchObject({
      enabled: true,
      model: "gemini-3.1-flash-image",
      provider: "google",
      requestTimeoutMs: 210_000,
    });
    const openai = readDrapeRoomConfig(
      enabledTryonEnv({
        FTT_TRYON_GOOGLE_API_KEY: undefined,
        FTT_TRYON_MODEL: "gpt-image-2",
        FTT_TRYON_OPENAI_API_KEY: "server-openai-key",
        FTT_TRYON_PROVIDER: "openai",
        FTT_TRYON_PROVIDER_TIMEOUT_MS: "90000",
      }),
    );
    expect(openai).toMatchObject({
      enabled: true,
      model: "gpt-image-2",
      provider: "openai",
      requestTimeoutMs: 90_000,
    });
  });

  it("accepts Node's process.env host object after normalising it", () => {
    for (const [name, value] of Object.entries(enabledTryonEnv())) {
      if (value !== undefined) vi.stubEnv(name, value);
    }

    expect(readDrapeRoomConfig(process.env)).toMatchObject({
      enabled: true,
      model: "gemini-3.1-flash-image",
      provider: "google",
    });
  });

  it.each([
    [{ FTT_TRYON_PROVIDER: "anthropic" }, "invalid_provider"],
    [{ FTT_TRYON_MODEL: "claude-opus-4-6" }, "invalid_model"],
    [{ FTT_TRYON_MODEL: "gpt-image-2" }, "invalid_provider_model_pair"],
    [{ FTT_TRYON_GOOGLE_API_KEY: undefined }, "missing_api_key"],
    [{ FTT_TRYON_PROVIDER_TIMEOUT_MS: undefined }, "invalid_timeout"],
    [{ FTT_TRYON_PROVIDER_TIMEOUT_MS: "" }, "invalid_timeout"],
    [{ FTT_TRYON_PROVIDER_TIMEOUT_MS: "210001" }, "invalid_timeout"],
    [{ FTT_TRYON_SESSION_SECRET: "short" }, "invalid_secret"],
    [{ FTT_TRYON_MONTHLY_LIMIT_MICRO_USD: "0" }, "invalid_monthly_limit"],
    [{ FTT_TRYON_PROMPT_VERSION: "nivi-v1" }, "invalid_version"],
    [{ FTT_TRYON_ALLOWED_ORIGINS: "https://evil.example/path" }, "invalid_origins"],
  ])("fails closed for %o", (overrides, code) => {
    expect(() => readDrapeRoomConfig(enabledTryonEnv(overrides))).toThrowError(
      expect.objectContaining({
        code: code as DrapeRoomConfigError["code"],
      } satisfies Partial<DrapeRoomConfigError>),
    );
  });

  it("requires durable Redis and DATABASE_URL when enabled in production", () => {
    expect(() =>
      readDrapeRoomConfig(
        enabledTryonEnv({
          NODE_ENV: "production",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "invalid_infrastructure" }),
    );
  });

  it("rejects any public try-on secret even while disabled", () => {
    expect(() =>
      readDrapeRoomConfig({
        FTT_TRYON_ENABLED: "false",
        NEXT_PUBLIC_FTT_TRYON_OPENAI_API_KEY: "must-never-be-public",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "public_secret_forbidden" }),
    );
  });

  it("rejects a non-string environment value at the Zod record boundary", () => {
    expect(() =>
      readDrapeRoomConfig({
        FTT_TRYON_ENABLED: 1 as unknown as string,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "invalid_environment" }),
    );
  });

  it("uses exactly the documented FTT_TRYON_* operational names", () => {
    expect(FTT_TRYON_ENV_NAMES).toEqual([
      "FTT_TRYON_ALLOWED_ORIGINS",
      "FTT_TRYON_DISCLOSURE_VERSION",
      "FTT_TRYON_ENABLED",
      "FTT_TRYON_ENGINE_VERSION",
      "FTT_TRYON_GOOGLE_API_KEY",
      "FTT_TRYON_HMAC_SECRET",
      "FTT_TRYON_IP_HASH_SECRET",
      "FTT_TRYON_MODEL",
      "FTT_TRYON_MONTHLY_LIMIT_MICRO_USD",
      "FTT_TRYON_OPENAI_API_KEY",
      "FTT_TRYON_OUTPUT_VERSION",
      "FTT_PRIVACY_POLICY_VERSION",
      "FTT_TRYON_PROMPT_VERSION",
      "FTT_TRYON_PROVIDER",
      "FTT_TRYON_PROVIDER_TIMEOUT_MS",
      "FTT_TRYON_SESSION_SECRET",
    ]);
    expect(FTT_TRYON_ENV_NAMES.some((name) => name.startsWith("TRYON_"))).toBe(
      false,
    );
  });

  it("returns disabled public config on invalid env without leaking the secret", async () => {
    const apiKey = "secret-that-must-never-appear";
    const response = handleTryonConfigRequest(
      new Request("https://www.fromthetrunk.shop/api/tryon/config"),
      {
        env: enabledTryonEnv({
          FTT_TRYON_GOOGLE_API_KEY: `${apiKey}\ninvalid`,
        }),
      },
    );
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ enabled: false });
    expect(text).not.toContain(apiKey);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get(TRYON_CONSENT_TOKEN_HEADER)).toBeNull();
  });

  it("logs only the redacted config code for development config failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = handleTryonConfigRequest(
      new Request("http://localhost:3000/api/tryon/config"),
      {
        env: enabledTryonEnv({
          FTT_TRYON_GOOGLE_API_KEY: undefined,
          NODE_ENV: "development",
        }),
      },
    );

    expect(response.status).toBe(503);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "[drape-room/config]",
      "missing_api_key",
    );
  });

  it("does not log config failures outside development", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = handleTryonConfigRequest(
      new Request("https://www.fromthetrunk.shop/api/tryon/config"),
      {
        env: enabledTryonEnv({
          FTT_TRYON_GOOGLE_API_KEY: undefined,
          NODE_ENV: "test",
        }),
      },
    );

    expect(response.status).toBe(503);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("keeps JSON unchanged and returns consent only in a header bound to the signed session", async () => {
    const env = enabledTryonEnv();
    const now = 1_800_000_000_000;
    const config = readDrapeRoomConfig(env);
    if (!config.enabled) throw new Error("expected enabled config");
    const response = handleTryonConfigRequest(
      new Request("https://www.fromthetrunk.shop/api/tryon/config"),
      { env, now },
    );
    const body = await response.text();
    const cookie = response.headers.get("set-cookie");
    const consentToken = response.headers.get(TRYON_CONSENT_TOKEN_HEADER);
    expect(JSON.parse(body)).toEqual(config.publicConfig);
    expect(cookie).toContain("ftt-tryon-session-dev=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("Domain=");
    expect(consentToken).toMatch(
      /^v1\.\d{13}\.\d{13}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(body).not.toContain(consentToken);
    expect(body).not.toContain(env.FTT_TRYON_GOOGLE_API_KEY);
    expect(body).not.toContain(env.FTT_TRYON_SESSION_SECRET);

    const sessionValue = cookie?.split(";", 1)[0]?.split("=", 2)[1];
    const session = verifyTryonSession(
      config.sessionSecret,
      sessionValue,
      now,
    );
    if (!session) throw new Error("expected verified session");
    expect(
      verifyTryonConsentToken(
        config,
        config.hmacSecret,
        session.nonce,
        consentToken,
        now,
      ),
    ).toBe(true);
  });

  it("omits consent and session headers while generation is disabled", async () => {
    const response = handleTryonConfigRequest(
      new Request("https://www.fromthetrunk.shop/api/tryon/config"),
      { env: { FTT_TRYON_ENABLED: "false", NODE_ENV: "test" }, now: 1_800_000_000_000 },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get(TRYON_CONSENT_TOKEN_HEADER)).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ enabled: false });
  });
});
