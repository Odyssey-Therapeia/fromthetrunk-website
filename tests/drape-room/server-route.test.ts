import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeImageProvider } from "@/lib/drape-room/providers/fake";
import type {
  BudgetReservation,
  FinalizeTryonBudgetInput,
  ReserveTryonBudgetInput,
} from "@/lib/drape-room/ledger/budget";
import {
  issueTryonConsentToken,
  TRYON_CONSENT_TOKEN_HEADER,
  TRYON_CONSENT_TOKEN_TTL_MS,
} from "@/lib/drape-room/security/consent-token";
import {
  issueTryonSession,
  tryonSessionCookieName,
} from "@/lib/drape-room/security/session";
import {
  readDrapeRoomConfig,
  type DrapeRoomEnvironment,
  type EnabledDrapeRoomConfig,
} from "@/lib/drape-room/server/config";
import {
  createTryonInvocationDeadline,
  TRYON_PLATFORM_MAX_DURATION_MS,
  TRYON_SETTLEMENT_DEADLINE_MS,
  TRYON_SETTLEMENT_MARGIN_MS,
  TRYON_WORK_DEADLINE_MS,
} from "@/lib/drape-room/server/deadline";
import { handleTryonGenerateRequest } from "@/lib/drape-room/server/orchestrator";
import { DrapeProviderError } from "@/lib/drape-room/server/provider";
import type { TryonGenerateDependencies } from "@/lib/drape-room/server/route-contract";
import {
  maxDuration as generationMaxDuration,
  runtime as generationRuntime,
} from "@/app/api/tryon/generate/route";

const NOW = 1_800_000_000_000;
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_ID = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://www.fromthetrunk.shop";
const REFERENCE_VERSION = "pdp:sourcehash:generation-v1";
const DAILY_RESET_AT = NOW + 60 * 60 * 1_000;
const secret = (label: string) => `${label}-${"x".repeat(40)}`;

function enabledEnv(
  overrides: DrapeRoomEnvironment = {},
): DrapeRoomEnvironment {
  return {
    FTT_PRIVACY_POLICY_VERSION: "2026-08-ai-v1",
    FTT_TRYON_ALLOWED_ORIGINS: ORIGIN,
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
  };
}

function enabledConfig(env = enabledEnv()): EnabledDrapeRoomConfig {
  const config = readDrapeRoomConfig(env);
  if (!config.enabled) throw new Error("expected enabled test config");
  return config;
}

async function jpeg(width = 640, height = 800): Promise<Uint8Array> {
  return Uint8Array.from(
    await sharp({
      create: {
        background: { b: 75, g: 45, r: 120 },
        channels: 3,
        height,
        width,
      },
    })
      .jpeg()
      .toBuffer(),
  );
}

async function requestFor(input: {
  background?: string;
  config: EnabledDrapeRoomConfig;
  idempotencyKey?: string;
  nodeEnv?: "production" | "test";
  extra?: [string, string];
  origin?: string | null;
  regeneration?: string;
  consent?: "expired" | "missing" | "other-session" | "tampered" | "valid";
  consentConfig?: EnabledDrapeRoomConfig;
}): Promise<Request> {
  const form = new FormData();
  const photo = await jpeg();
  const photoBody = photo.buffer.slice(
    photo.byteOffset,
    photo.byteOffset + photo.byteLength,
  ) as ArrayBuffer;
  form.set(
    "photo",
    new File([photoBody], "processed.jpg", { type: "image/jpeg" }),
  );
  form.set("productId", PRODUCT_ID);
  form.set("background", input.background ?? "studio");
  form.set("idempotencyKey", input.idempotencyKey ?? IDEMPOTENCY_ID);
  if (input.regeneration !== undefined) {
    form.set("regeneration", input.regeneration);
  }
  if (input.extra) form.set(...input.extra);
  const nodeEnv = input.nodeEnv ?? "test";
  const session = issueTryonSession(input.config.sessionSecret, undefined, NOW);
  if (!session) throw new Error("could not issue test session");
  const consentMode = input.consent ?? "valid";
  const consentConfig = input.consentConfig ?? input.config;
  const consentSession =
    consentMode === "other-session"
      ? issueTryonSession(input.config.sessionSecret, undefined, NOW)
      : session;
  if (!consentSession) throw new Error("could not issue consent session");
  const consentIssuedAt =
    consentMode === "expired" ? NOW - TRYON_CONSENT_TOKEN_TTL_MS : NOW;
  const issuedConsentToken = issueTryonConsentToken(
    consentConfig,
    consentConfig.hmacSecret,
    consentSession.nonce,
    consentIssuedAt,
  );
  if (!issuedConsentToken) throw new Error("could not issue consent token");
  const consentToken =
    consentMode === "tampered"
      ? `${issuedConsentToken.slice(0, -1)}${issuedConsentToken.endsWith("a") ? "b" : "a"}`
      : issuedConsentToken;
  const headers: Record<string, string> = {
    Cookie: `${tryonSessionCookieName(nodeEnv)}=${session.value}`,
    "Sec-Fetch-Site": "same-origin",
    "X-Real-IP": "203.0.113.10",
  };
  if (consentMode !== "missing") {
    headers[TRYON_CONSENT_TOKEN_HEADER] = consentToken;
  }
  if (input.origin !== null) headers.Origin = input.origin ?? ORIGIN;
  return new Request(`${ORIGIN}/api/tryon/generate`, {
    body: form,
    headers,
    method: "POST",
  });
}

type Harness = {
  dependencies: TryonGenerateDependencies;
  provider: ReturnType<typeof createFakeImageProvider>;
  finalizations: FinalizeTryonBudgetInput[];
  reservations: ReserveTryonBudgetInput[];
  bindProduct: ReturnType<typeof vi.fn>;
  claimProductDailyQuota: ReturnType<typeof vi.fn>;
  commitDailyQuota: ReturnType<typeof vi.fn>;
  releaseDailyQuota: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

async function harness(
  overrides: Partial<TryonGenerateDependencies> = {},
): Promise<Harness> {
  const config = enabledConfig();
  const provider = createFakeImageProvider({
    output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
  });
  const finalizations: FinalizeTryonBudgetInput[] = [];
  const reservations: ReserveTryonBudgetInput[] = [];
  const bindProduct = vi.fn(async () => true);
  const commitDailyQuota = vi.fn(async () => undefined);
  const releaseDailyQuota = vi.fn(async () => undefined);
  const claimProductDailyQuota = vi.fn(async () => ({
    allowed: true as const,
    quota: {
      dayKey: "2027-01-15",
      limit: 3 as const,
      remaining: 2 as const,
      resetAt: DAILY_RESET_AT,
      used: 1 as const,
    },
    commitProviderDispatchAttempted: commitDailyQuota,
    releaseBeforeProvider: releaseDailyQuota,
  }));
  const release = vi.fn(async () => ({
    complete: true,
    global: "released" as const,
    session: "released" as const,
  }));
  return {
    dependencies: {
      acquireLease: async () => ({
        acquired: true,
        lease: { release },
      }),
      checkRateAdmission: async () => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
      checkGlobalRateAdmission: async () => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
      checkProductAdmissionGuard: async () => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
      checkProviderCircuit: async () => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
      bindProduct,
      claimProductDailyQuota,
      createProvider: async () => provider,
      createRedisClient: () => ({ eval: vi.fn() }),
      createRequestId: () => REQUEST_ID,
      env: enabledEnv(),
      finalizeBudget: async (input) => {
        finalizations.push(input);
        return true;
      },
      loadProduct: async () => ({
        references: [
          {
            bytes: await jpeg(),
            mimeType: "image/jpeg",
            version: "primary-reference-v1",
          },
          {
            bytes: await jpeg(),
            mimeType: "image/jpeg",
            version: "detail-reference-v1",
          },
        ],
        saree: { productReferenceVersion: REFERENCE_VERSION },
      }),
      markProviderDispatchAttempted: async () => true,
      now: () => NOW,
      rateLimitsReady: () => true,
      recordInvalidProductAdmission: async () => 0,
      recordProviderCircuitFailure: async () => 0,
      recordProviderCircuitSuccess: async () => undefined,
      readConfig: () => config,
      reserveBudget: async (input) => {
        reservations.push(input);
        return {
          outcome: "reserved",
          requestId: input.requestId,
          requestStatus: "reserved",
        };
      },
      ...overrides,
    },
    finalizations,
    bindProduct,
    claimProductDailyQuota,
    commitDailyQuota,
    provider,
    release,
    releaseDailyQuota,
    reservations,
  };
}

async function errorBody(response: Response) {
  return (await response.json()) as { code: string; message: string };
}

describe("Drape Room generation application service", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("uses the dedicated Node route with a 240-second platform ceiling", () => {
    expect(generationRuntime).toBe("nodejs");
    expect(generationMaxDuration).toBe(240);
    expect(TRYON_PLATFORM_MAX_DURATION_MS).toBe(generationMaxDuration * 1_000);
    expect(TRYON_WORK_DEADLINE_MS + TRYON_SETTLEMENT_MARGIN_MS).toBe(
      TRYON_SETTLEMENT_DEADLINE_MS,
    );
    expect(TRYON_SETTLEMENT_DEADLINE_MS).toBeLessThan(
      TRYON_PLATFORM_MAX_DURATION_MS,
    );
  });

  it("bounds the Redis lease and preserves only a settlement window", async () => {
    let clock = NOW;
    const deadline = createTryonInvocationDeadline({ now: () => clock });
    try {
      expect(deadline.redisLeaseMs()).toBe(TRYON_SETTLEMENT_DEADLINE_MS);
      clock += 1_000;
      expect(deadline.redisLeaseMs()).toBe(
        TRYON_SETTLEMENT_DEADLINE_MS - 1_000,
      );
      clock = NOW + TRYON_WORK_DEADLINE_MS;
      expect(() => deadline.assertWorkAvailable()).toThrowError(
        expect.objectContaining({ code: "deadline_exceeded" }),
      );
      expect(deadline.signal.aborted).toBe(true);
      const settlement = vi.fn(async () => true);
      await expect(
        deadline.runBeforeSettlementDeadline(settlement),
      ).resolves.toBe(true);
      expect(settlement).toHaveBeenCalledOnce();

      clock = NOW + TRYON_SETTLEMENT_DEADLINE_MS;
      const tooLate = vi.fn(async () => true);
      await expect(
        deadline.runBeforeSettlementDeadline(tooLate),
      ).rejects.toMatchObject({ code: "deadline_exceeded" });
      expect(tooLate).not.toHaveBeenCalled();
    } finally {
      deadline.dispose();
    }
  });

  it("interrupts an async dependency that does not observe AbortSignal", async () => {
    const upstream = new AbortController();
    const deadline = createTryonInvocationDeadline({
      now: () => NOW,
      upstreamSignal: upstream.signal,
    });
    try {
      const pending = deadline.runBeforeWorkDeadline(
        () => new Promise<never>(() => undefined),
      );
      upstream.abort();
      await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    } finally {
      deadline.dispose();
    }
  });

  it("is disabled by default and returns 503 without any provider work", async () => {
    const test = await harness({
      readConfig: () => readDrapeRoomConfig({}),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(response.status).toBe(503);
    expect(await errorBody(response)).toMatchObject({ code: "TRYON_DISABLED" });
    expect(test.provider.requests).toHaveLength(0);
    expect(test.reservations).toHaveLength(0);
  });

  it("calls the fake provider exactly once only after explicit POST admission", async () => {
    const test = await harness();
    const config = enabledConfig();
    const response = await handleTryonGenerateRequest(
      await requestFor({ config }),
      test.dependencies,
    );
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-ftt-tryon-request-id")).toBe(REQUEST_ID);
    expect(response.headers.get("x-ftt-tryon-provider")).toBe("google");
    expect(response.headers.get("x-ftt-tryon-model")).toBe(
      "gemini-3.1-flash-image",
    );
    expect(response.headers.get("x-ftt-tryon-prompt-version")).toBe("nivi-v4");
    expect(response.headers.get("x-ftt-tryon-engine-version")).toBe(
      "storefront-v1",
    );
    expect(response.headers.get("x-ftt-tryon-output-version")).toBe(
      "jpeg-1k-v1",
    );
    expect(
      response.headers.get("x-ftt-tryon-product-reference-version"),
    ).toBe(REFERENCE_VERSION);
    expect(response.headers.get("x-ftt-tryon-daily-limit")).toBe("3");
    expect(response.headers.get("x-ftt-tryon-daily-used")).toBe("1");
    expect(response.headers.get("x-ftt-tryon-daily-remaining")).toBe("2");
    expect(response.headers.get("x-ftt-tryon-daily-reset-at")).toBe(
      new Date(DAILY_RESET_AT).toISOString(),
    );
    expect(body.byteLength).toBeLessThanOrEqual(3_800_000);
    expect(test.provider.requests).toHaveLength(1);
    expect(test.reservations).toHaveLength(1);
    expect(test.reservations[0]).not.toHaveProperty("regeneration");
    expect(test.claimProductDailyQuota).toHaveBeenCalledOnce();
    expect(test.claimProductDailyQuota.mock.calls[0]?.slice(1)).toEqual([
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      PRODUCT_ID,
      REQUEST_ID,
      NOW,
    ]);
    expect(test.commitDailyQuota).toHaveBeenCalledOnce();
    expect(test.releaseDailyQuota).not.toHaveBeenCalled();
    expect(test.bindProduct).toHaveBeenCalledExactlyOnceWith({
      productId: PRODUCT_ID,
      productReferenceVersion: REFERENCE_VERSION,
      referenceContractVersion: "gallery-v2",
      referenceCount: 3,
      referenceMode: "dual",
      requestId: REQUEST_ID,
    });
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        actualMicroUsd: null,
        outputByteSize: body.byteLength,
        requestId: REQUEST_ID,
        status: "succeeded",
      }),
    ]);
    expect(test.release).toHaveBeenCalledOnce();
  });

  it("prices a single product reference as two total provider images", async () => {
    const singleReferenceVersion =
      "gallery-v2:single:44444444-4444-4444-8444-444444444444:abcdef0123456789";
    const provider = createFakeImageProvider({
      estimateMicroUsd: (referenceCount) => referenceCount * 100_000,
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
    });
    const test = await harness({
      createProvider: async () => provider,
      loadProduct: async () => ({
        references: [
          {
            bytes: await jpeg(),
            mimeType: "image/jpeg",
            version: "single-product-reference-v1",
          },
        ],
        saree: { productReferenceVersion: singleReferenceVersion },
      }),
    });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-ftt-tryon-product-reference-version"),
    ).toBe(singleReferenceVersion);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.garments).toHaveLength(1);
    expect(provider.requests[0]?.prompt).toContain(
      "exactly two reference images",
    );
    expect(provider.estimatedReferenceCounts).toEqual([3, 2]);
    expect(test.reservations[0]?.forecastMicroUsd).toBe(200_000);
    expect(test.bindProduct).toHaveBeenCalledExactlyOnceWith({
      productId: PRODUCT_ID,
      productReferenceVersion: singleReferenceVersion,
      referenceContractVersion: "gallery-v2",
      referenceCount: 2,
      referenceMode: "single",
      requestId: REQUEST_ID,
    });
  });

  it("prices dual product references as three total provider images", async () => {
    const provider = createFakeImageProvider({
      estimateMicroUsd: (referenceCount) => referenceCount * 100_000,
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
    });
    const test = await harness({ createProvider: async () => provider });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(provider.estimatedReferenceCounts).toEqual([3, 3]);
    expect(test.reservations[0]?.forecastMicroUsd).toBe(300_000);
    expect(test.bindProduct).toHaveBeenCalledWith(
      expect.objectContaining({ referenceCount: 3, referenceMode: "dual" }),
    );
  });

  it("keeps browser cache identity on the configured model while auditing the served model", async () => {
    const config = enabledConfig();
    const provider = createFakeImageProvider({
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
      servedModel: "gemini-3.1-flash-image-2026-08-serve-17",
    });
    const test = await harness({ createProvider: async () => provider });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ftt-tryon-model")).toBe(config.model);
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        servedModel: "gemini-3.1-flash-image-2026-08-serve-17",
        status: "succeeded",
      }),
    ]);
  });

  it("rejects extra provider/model/prompt/URL fields before any paid admission", async () => {
    for (const field of ["provider", "model", "prompt", "url", "drape"]) {
      const test = await harness();
      const response = await handleTryonGenerateRequest(
        await requestFor({
          config: enabledConfig(),
          extra: [field, "attacker-controlled"],
        }),
        test.dependencies,
      );
      expect(response.status).toBe(400);
      expect(test.reservations).toHaveLength(0);
      expect(test.provider.requests).toHaveLength(0);
    }
  });

  it("rejects invalid scalars and the removed public regeneration field", async () => {
    for (const requestOptions of [
      { background: "custom-scene" },
      { regeneration: "false" },
      { regeneration: "true" },
    ]) {
      const checkGlobalRateAdmission = vi.fn(async () => ({
        allowed: true as const,
        retryAfterSeconds: 0 as const,
      }));
      const acquireLease = vi.fn(async () => {
        throw new Error("lease must not be acquired");
      });
      const markProviderDispatchAttempted = vi.fn(async () => true);
      const test = await harness({
        acquireLease,
        checkGlobalRateAdmission,
        markProviderDispatchAttempted,
      });
      const response = await handleTryonGenerateRequest(
        await requestFor({ config: enabledConfig(), ...requestOptions }),
        test.dependencies,
      );
      expect(response.status).toBe(400);
      expect(checkGlobalRateAdmission).not.toHaveBeenCalled();
      expect(acquireLease).not.toHaveBeenCalled();
      expect(test.claimProductDailyQuota).not.toHaveBeenCalled();
      expect(test.reservations).toHaveLength(0);
      expect(test.bindProduct).not.toHaveBeenCalled();
      expect(markProviderDispatchAttempted).not.toHaveBeenCalled();
      expect(test.provider.requests).toHaveLength(0);
    }
  });

  it("rejects missing Origin and a tampered session before provider work", async () => {
    const missing = await harness();
    const noOrigin = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig(), origin: null }),
      missing.dependencies,
    );
    expect(await errorBody(noOrigin)).toMatchObject({
      code: "TRYON_FORBIDDEN_ORIGIN",
    });
    expect(missing.provider.requests).toHaveLength(0);

    const tampered = await harness();
    const request = await requestFor({ config: enabledConfig() });
    request.headers.set("cookie", "ftt-tryon-session-dev=tampered");
    const badSession = await handleTryonGenerateRequest(
      request,
      tampered.dependencies,
    );
    expect(await errorBody(badSession)).toMatchObject({
      code: "TRYON_SESSION_REQUIRED",
    });
    expect(tampered.provider.requests).toHaveLength(0);
  });

  it("requires current session-bound consent before parsing or paid admission", async () => {
    const original = enabledConfig();
    const providerChanged = enabledConfig(
      enabledEnv({
        FTT_TRYON_GOOGLE_API_KEY: undefined,
        FTT_TRYON_MODEL: "gpt-image-2",
        FTT_TRYON_OPENAI_API_KEY: "test-openai-key-never-used",
        FTT_TRYON_PROVIDER: "openai",
      }),
    );
    const disclosureChanged = enabledConfig(
      enabledEnv({
        FTT_PRIVACY_POLICY_VERSION: "2026-09-ai-v2",
        FTT_TRYON_DISCLOSURE_VERSION: "provider-disclosure-v2",
      }),
    );
    const renderVersionChanged = enabledConfig(
      enabledEnv({
        FTT_TRYON_ENGINE_VERSION: "storefront-v2",
        FTT_TRYON_OUTPUT_VERSION: "jpeg-1k-v2",
      }),
    );
    const cases: Array<{
      config: EnabledDrapeRoomConfig;
      consent?: "expired" | "missing" | "other-session" | "tampered";
      consentConfig?: EnabledDrapeRoomConfig;
      name: string;
    }> = [
      { config: original, consent: "missing", name: "missing" },
      { config: original, consent: "tampered", name: "tampered" },
      { config: original, consent: "expired", name: "expired" },
      {
        config: original,
        consent: "other-session",
        name: "other session",
      },
      {
        config: providerChanged,
        consentConfig: original,
        name: "provider/model change",
      },
      {
        config: disclosureChanged,
        consentConfig: original,
        name: "disclosure/privacy change",
      },
      {
        config: renderVersionChanged,
        consentConfig: original,
        name: "engine/output version change",
      },
    ];

    for (const rejection of cases) {
      const parseMultipart = vi.fn(async () => {
        throw new Error("multipart parsing must not run");
      });
      const checkRateAdmission = vi.fn(async () => ({
        allowed: true as const,
        retryAfterSeconds: 0 as const,
      }));
      const acquireLease = vi.fn(async () => {
        throw new Error("lease acquisition must not run");
      });
      const reserveBudget = vi.fn(async () => {
        throw new Error("budget reservation must not run");
      });
      const test = await harness({
        acquireLease,
        checkRateAdmission,
        parseMultipart,
        readConfig: () => rejection.config,
        reserveBudget,
      });
      const createProvider = vi.fn(async () => test.provider);
      test.dependencies.createProvider = createProvider;
      const response = await handleTryonGenerateRequest(
        await requestFor({
          config: rejection.config,
          consent: rejection.consent,
          consentConfig: rejection.consentConfig,
        }),
        test.dependencies,
      );

      expect(response.status, rejection.name).toBe(428);
      expect(await errorBody(response), rejection.name).toMatchObject({
        code: "CONSENT_REQUIRED",
      });
      expect(parseMultipart, rejection.name).not.toHaveBeenCalled();
      expect(checkRateAdmission, rejection.name).not.toHaveBeenCalled();
      expect(createProvider, rejection.name).not.toHaveBeenCalled();
      expect(acquireLease, rejection.name).not.toHaveBeenCalled();
      expect(reserveBudget, rejection.name).not.toHaveBeenCalled();
      expect(test.provider.requests, rejection.name).toHaveLength(0);
      expect(test.reservations, rejection.name).toHaveLength(0);
    }
  });

  it("fails closed when Redis is unavailable in production", async () => {
    const test = await harness({
      createRedisClient: () => null,
      env: enabledEnv({ NODE_ENV: "production" }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig(), nodeEnv: "production" }),
      test.dependencies,
    );
    expect(await errorBody(response)).toMatchObject({
      code: "TRYON_CONFIGURATION_INVALID",
    });
    expect(test.reservations).toHaveLength(0);
    expect(test.provider.requests).toHaveLength(0);
    expect(test.bindProduct).not.toHaveBeenCalled();
  });

  it("logs only a bounded reason when consent verification fails", async () => {
    vi.stubEnv("FTT_TRYON_TEST_OBSERVABILITY", "true");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const config = enabledConfig();
    const request = await requestFor({ config, consent: "expired" });
    const rawConsent = request.headers.get(TRYON_CONSENT_TOKEN_HEADER);
    const test = await harness();

    const response = await handleTryonGenerateRequest(request, test.dependencies);
    const output = stdout.mock.calls.map(([value]) => String(value)).join("\n");

    expect(response.status).toBe(428);
    expect(output).toContain('"stage":"consent_verification"');
    expect(output).toContain('"consentReason":"expired"');
    expect(output).not.toContain(rawConsent);
    expect(test.provider.requests).toHaveLength(0);
    expect(test.reservations).toHaveLength(0);
  });

  it("logs the exact budget-reservation stage without exposing request secrets", async () => {
    vi.stubEnv("FTT_TRYON_TEST_OBSERVABILITY", "true");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const test = await harness({
      reserveBudget: async () => {
        throw new Error(
          "function public.ftt_ai_tryon_reserve(text,bigint) does not exist",
        );
      },
    });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    const output = stdout.mock.calls.map(([value]) => String(value)).join("\n");

    expect(response.status).toBe(503);
    expect(await errorBody(response)).toMatchObject({
      code: "TRYON_CONFIGURATION_INVALID",
    });
    expect(response.headers.get("X-FTT-Tryon-Trace-Id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(output).toContain('"stage":"budget_reservation"');
    expect(output).toContain("ftt_ai_tryon_reserve");
    expect(output).not.toContain("test-key-never-used");
    expect(output).not.toContain(secret("hmac"));
    expect(test.provider.requests).toHaveLength(0);
  });

  it("does not call the provider when the atomic budget is exhausted", async () => {
    const test = await harness({
      reserveBudget: async (): Promise<BudgetReservation> => ({
        outcome: "budget_exhausted",
        requestId: null,
        requestStatus: null,
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(await errorBody(response)).toMatchObject({
      code: "TRYON_BUDGET_PAUSED",
    });
    expect(test.provider.requests).toHaveLength(0);
    expect(test.finalizations).toHaveLength(0);
    expect(test.claimProductDailyQuota).toHaveBeenCalledOnce();
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
  });

  it("returns the authoritative daily quota before reserving budget on the fourth generation", async () => {
    const retryAfterSeconds = 3_600;
    const test = await harness({
      claimProductDailyQuota: async () => ({
        allowed: false,
        quota: {
          dayKey: "2027-01-15",
          limit: 3,
          remaining: 0,
          resetAt: DAILY_RESET_AT,
          used: 3,
        },
        retryAfterSeconds,
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(429);
    expect(await errorBody(response)).toMatchObject({
      code: "TRYON_PRODUCT_DAILY_LIMIT",
    });
    expect(response.headers.get("retry-after")).toBe(String(retryAfterSeconds));
    expect(response.headers.get("x-ftt-tryon-daily-limit")).toBe("3");
    expect(response.headers.get("x-ftt-tryon-daily-used")).toBe("3");
    expect(response.headers.get("x-ftt-tryon-daily-remaining")).toBe("0");
    expect(response.headers.get("x-ftt-tryon-daily-reset-at")).toBe(
      new Date(DAILY_RESET_AT).toISOString(),
    );
    expect(test.provider.requests).toHaveLength(0);
    expect(test.reservations).toHaveLength(0);
    expect(test.finalizations).toHaveLength(0);
  });

  it("releases a claimed daily slot when the provider-start ledger transition fails", async () => {
    const test = await harness({
      markProviderDispatchAttempted: async () => false,
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(503);
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
    expect(test.commitDailyQuota).not.toHaveBeenCalled();
    expect(test.provider.requests).toHaveLength(0);
    expect(test.finalizations).toEqual([
      expect.objectContaining({ actualMicroUsd: 0, status: "failed_pre_provider" }),
    ]);
  });

  it("rejects sold products before scarce admission or reservation", async () => {
    const checkGlobalRateAdmission = vi.fn();
    const acquireLease = vi.fn();
    const test = await harness({
      acquireLease,
      checkGlobalRateAdmission,
      loadProduct: async () => {
        const error = new Error("metadata-only product failure");
        error.name = "TryonProductError";
        Object.assign(error, { code: "PRODUCT_UNAVAILABLE" });
        throw error;
      },
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(await errorBody(response)).toMatchObject({
      code: "PRODUCT_UNAVAILABLE",
    });
    expect(test.provider.requests).toHaveLength(0);
    expect(test.bindProduct).not.toHaveBeenCalled();
    expect(test.claimProductDailyQuota).not.toHaveBeenCalled();
    expect(checkGlobalRateAdmission).not.toHaveBeenCalled();
    expect(acquireLease).not.toHaveBeenCalled();
    expect(test.reservations).toHaveLength(0);
    expect(test.finalizations).toHaveLength(0);
  });

  it("does not claim daily quota when normalized references fail validation", async () => {
    const checkProviderCircuit = vi.fn();
    const checkGlobalRateAdmission = vi.fn();
    const acquireLease = vi.fn();
    const test = await harness({
      acquireLease,
      checkGlobalRateAdmission,
      checkProviderCircuit,
      loadProduct: async () => ({
        references: [
          {
            bytes: new Uint8Array([1, 2, 3]),
            mimeType: "image/jpeg",
            version: "primary-reference-v1",
          },
          {
            bytes: new Uint8Array([1, 2, 3]),
            mimeType: "image/jpeg",
            version: "detail-reference-v1",
          },
        ],
        saree: { productReferenceVersion: REFERENCE_VERSION },
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(await errorBody(response)).toMatchObject({
      code: "REFERENCE_UNAVAILABLE",
    });
    expect(test.claimProductDailyQuota).not.toHaveBeenCalled();
    expect(test.provider.requests).toHaveLength(0);
    expect(checkProviderCircuit).not.toHaveBeenCalled();
    expect(checkGlobalRateAdmission).not.toHaveBeenCalled();
    expect(acquireLease).not.toHaveBeenCalled();
  });

  it("checks the distributed provider circuit after image normalization and before scarce admission", async () => {
    const checkGlobalRateAdmission = vi.fn();
    const acquireLease = vi.fn();
    const test = await harness({
      acquireLease,
      checkGlobalRateAdmission,
      checkProviderCircuit: async () => ({
        allowed: false,
        retryAfterSeconds: 120,
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(await errorBody(response)).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(checkGlobalRateAdmission).not.toHaveBeenCalled();
    expect(acquireLease).not.toHaveBeenCalled();
    expect(test.claimProductDailyQuota).not.toHaveBeenCalled();
    expect(test.reservations).toHaveLength(0);
  });

  it("does not acquire provider concurrency when the validated request hits the global rate limit", async () => {
    const acquireLease = vi.fn();
    const test = await harness({
      acquireLease,
      checkGlobalRateAdmission: async () => ({
        allowed: false,
        retryAfterSeconds: 90,
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(acquireLease).not.toHaveBeenCalled();
    expect(test.claimProductDailyQuota).not.toHaveBeenCalled();
    expect(test.reservations).toHaveLength(0);
  });

  it("releases a half-open probe when a pre-dispatch budget gate rejects", async () => {
    const probe = { stateVersion: "1800000000000", token: "probe-token" };
    const releaseProviderCircuitProbe = vi.fn(async () => undefined);
    const test = await harness({
      checkProviderCircuit: async () => ({
        allowed: true,
        probe,
        retryAfterSeconds: 0,
      }),
      releaseProviderCircuitProbe,
      reserveBudget: async () => ({
        outcome: "budget_exhausted",
        requestId: null,
        requestStatus: null,
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(503);
    expect(releaseProviderCircuitProbe).toHaveBeenCalledWith(
      expect.anything(),
      "google",
      "gemini-3.1-flash-image",
      probe,
    );
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
    expect(test.provider.requests).toHaveLength(0);
  });

  it("reopens a half-open probe after a qualifying dispatch failure", async () => {
    const probe = { stateVersion: "1800000000000", token: "probe-token" };
    const recordProviderCircuitFailure = vi.fn(async () => 300);
    const releaseProviderCircuitProbe = vi.fn(async () => undefined);
    const provider = createFakeImageProvider({
      onGenerate: async () => {
        throw new DrapeProviderError("upstream_unavailable", 503);
      },
      output: { bytes: await jpeg(), mimeType: "image/jpeg" },
    });
    const test = await harness({
      checkProviderCircuit: async () => ({
        allowed: true,
        probe,
        retryAfterSeconds: 0,
      }),
      createProvider: async () => provider,
      recordProviderCircuitFailure,
      releaseProviderCircuitProbe,
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(504);
    expect(recordProviderCircuitFailure).toHaveBeenCalledWith(
      expect.anything(),
      "google",
      "gemini-3.1-flash-image",
      "upstream_unavailable",
      probe,
    );
    expect(releaseProviderCircuitProbe).not.toHaveBeenCalled();
  });

  it("settles ambiguous provider timeout conservatively and never retries", async () => {
    const output = await jpeg();
    const provider = createFakeImageProvider({
      onGenerate: async () => {
        throw new DrapeProviderError("deadline_exceeded", 504);
      },
      output: { bytes: output, mimeType: "image/jpeg" },
    });
    const test = await harness({ createProvider: async () => provider });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    const body = await errorBody(response);
    expect(body).toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(body.message).toContain("may have processed this request");
    expect(body.message).toContain("have not retried automatically");
    expect(body.message).toContain("conservatively counted");
    expect(provider.requests).toHaveLength(1);
    expect(test.commitDailyQuota).toHaveBeenCalledOnce();
    expect(test.releaseDailyQuota).not.toHaveBeenCalled();
    expect(response.headers.get("x-ftt-tryon-daily-used")).toBe("1");
    expect(response.headers.get("x-ftt-tryon-daily-remaining")).toBe("2");
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        actualMicroUsd: null,
        status: "ambiguous_provider",
      }),
    ]);
  });

  it("reports every uncertain provider-started outcome as terminal and non-retried", async () => {
    const provider = createFakeImageProvider({
      onGenerate: async () => {
        throw new DrapeProviderError("upstream_unavailable", 503);
      },
      output: { bytes: await jpeg(), mimeType: "image/jpeg" },
    });
    const test = await harness({ createProvider: async () => provider });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(504);
    expect(await errorBody(response)).toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(provider.requests).toHaveLength(1);
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        actualMicroUsd: null,
        errorCode: "PROVIDER_TIMEOUT",
        status: "ambiguous_provider",
      }),
    ]);
  });

  it("settles invalid provider output conservatively as failed post-provider", async () => {
    const provider = createFakeImageProvider({
      output: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
    });
    const test = await harness({ createProvider: async () => provider });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(await errorBody(response)).toMatchObject({ code: "OUTPUT_INVALID" });
    expect(provider.requests).toHaveLength(1);
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        actualMicroUsd: null,
        status: "failed_post_provider",
      }),
    ]);
  });

  it("atomically admits one request when concurrent actions exhaust the budget", async () => {
    let reserved = false;
    const reserveBudget = vi.fn(
      async (input: ReserveTryonBudgetInput): Promise<BudgetReservation> => {
        if (reserved) {
          return {
            outcome: "budget_exhausted",
            requestId: null,
            requestStatus: null,
          };
        }
        reserved = true;
        return {
          outcome: "reserved",
          requestId: input.requestId,
          requestStatus: "reserved",
        };
      },
    );
    const test = await harness({ reserveBudget });
    const secondId = "44444444-4444-4444-8444-444444444444";
    const [first, second] = await Promise.all([
      handleTryonGenerateRequest(
        await requestFor({ config: enabledConfig() }),
        test.dependencies,
      ),
      handleTryonGenerateRequest(
        await requestFor({ config: enabledConfig(), idempotencyKey: secondId }),
        test.dependencies,
      ),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 503]);
    expect(test.provider.requests).toHaveLength(1);
    expect(reserveBudget).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent identical idempotency and calls provider once", async () => {
    let requestStatus: "in_progress" | null = null;
    let releaseProvider: (() => void) | undefined;
    let enteredProvider: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enteredProvider = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = createFakeImageProvider({
      onGenerate: async () => {
        requestStatus = "in_progress";
        enteredProvider?.();
        await wait;
      },
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
    });
    const reserveBudget = vi.fn(
      async (input: ReserveTryonBudgetInput): Promise<BudgetReservation> => {
        if (requestStatus) {
          return {
            outcome: "duplicate",
            requestId: REQUEST_ID,
            requestStatus,
          };
        }
        requestStatus = "in_progress";
        return {
          outcome: "reserved",
          requestId: input.requestId,
          requestStatus: "reserved",
        };
      },
    );
    const test = await harness({
      createProvider: async () => provider,
      reserveBudget,
    });
    const firstPromise = handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    await entered;
    const duplicate = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    releaseProvider?.();
    const first = await firstPromise;

    expect(first.status).toBe(200);
    expect(await errorBody(duplicate)).toMatchObject({
      code: "TRYON_ALREADY_PROCESSING",
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("returns an explicit terminal timeout for a reconciled ambiguous duplicate", async () => {
    const test = await harness({
      reserveBudget: async () => ({
        outcome: "duplicate",
        requestId: REQUEST_ID,
        requestStatus: "ambiguous_provider",
      }),
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(409);
    expect(await errorBody(response)).toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(test.provider.requests).toHaveLength(0);
    expect(test.finalizations).toHaveLength(0);
    expect(test.bindProduct).not.toHaveBeenCalled();
    expect(test.claimProductDailyQuota).toHaveBeenCalledOnce();
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
    expect(test.release).toHaveBeenCalledOnce();
  });

  it("passes metadata only to the ledger and never contacts a provider host", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (
          url.includes("api.openai.com") ||
          url.includes("generativelanguage.googleapis.com")
        ) {
          throw new Error("REAL_PROVIDER_HOST_FORBIDDEN_IN_TEST");
        }
        return new Response(null, { status: 204 });
      },
    );
    const test = await harness();
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(response.status).toBe(200);
    expect(network).not.toHaveBeenCalled();
    const ledgerPayload = {
      finalizations: test.finalizations,
      reservations: test.reservations,
    };
    const ledgerKeys = new Set<string>();
    const collectKeys = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        ledgerKeys.add(key.toLowerCase());
        collectKeys(child);
      }
    };
    collectKeys(ledgerPayload);
    for (const prohibited of [
      "photo",
      "image",
      "base64",
      "filename",
      "promptText",
      "rawIp",
      "providerResponse",
    ]) {
      expect(ledgerKeys).not.toContain(prohibited.toLowerCase());
    }
  });

  it("returns a disabled/config-invalid 503 with sanitized {code,message}", async () => {
    vi.stubEnv("FTT_TRYON_TEST_OBSERVABILITY", "true");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const test = await harness({
      readConfig: () => {
        throw new Error("DATABASE_URL=secret stack detail");
      },
    });
    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({
      code: "TRYON_CONFIGURATION_INVALID",
      message: "The Drape Room is temporarily unavailable.",
    });
    expect(text).not.toContain("DATABASE_URL");
    expect(text).not.toContain("stack");
    expect(response.headers.get("X-FTT-Tryon-Trace-Id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    const output = stdout.mock.calls.map(([value]) => String(value)).join("\n");
    expect(output).toContain('"stage":"configuration"');
    expect(output).toContain("DATABASE_URL=[redacted]");
    expect(output).not.toContain("DATABASE_URL=secret");
  });
});

describe("Drape Room metadata ledger lifecycle", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("records the product, background, provider, model and version identifiers", async () => {
    const test = await harness();

    const response = await handleTryonGenerateRequest(
      await requestFor({ background: "festival", config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(test.reservations).toHaveLength(1);
    expect(test.reservations[0]).toMatchObject({
      background: "festival",
      engineVersion: "storefront-v1",
      outputVersion: "jpeg-1k-v1",
      period: expect.stringMatching(/^\d{4}-\d{2}$/),
      provider: "google",
      requestId: REQUEST_ID,
      requestedModel: "gemini-3.1-flash-image",
    });
    // The product identity is attached by the separate bind step, never by the
    // reservation, so a request that dies before binding cannot claim a product.
    expect(test.reservations[0]).not.toHaveProperty("productId");
    expect(test.bindProduct).toHaveBeenCalledExactlyOnceWith({
      productId: PRODUCT_ID,
      productReferenceVersion: REFERENCE_VERSION,
      referenceContractVersion: "gallery-v2",
      referenceCount: 3,
      referenceMode: "dual",
      requestId: REQUEST_ID,
    });
  });

  it("finalizes a success with latency, output size, served model and no error code", async () => {
    const provider = createFakeImageProvider({
      latencyMs: 1_234,
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
      servedModel: "gemini-3.1-flash-image-002",
    });
    const test = await harness({ createProvider: async () => provider });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(test.finalizations).toEqual([
      {
        actualMicroUsd: null,
        errorCode: null,
        latencyMs: 1_234,
        outputByteSize: body.byteLength,
        requestId: REQUEST_ID,
        servedModel: "gemini-3.1-flash-image-002",
        status: "succeeded",
      },
    ]);
  });

  it("settles the provider-reported cost when it is reliable", async () => {
    const provider = createFakeImageProvider({
      estimateMicroUsd: (referenceCount) => referenceCount * 100_000,
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
      usage: {
        actualMicroUsd: 150_000,
        inputUnits: 3,
        outputUnits: 1,
        providerReported: true,
        usageVersion: "reported-v1",
      },
    });
    const test = await harness({ createProvider: async () => provider });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(test.reservations[0]?.forecastMicroUsd).toBe(300_000);
    expect(test.finalizations[0]).toMatchObject({
      actualMicroUsd: 150_000,
      status: "succeeded",
    });
  });

  it("falls back to the conservative forecast when the reported cost exceeds it", async () => {
    const provider = createFakeImageProvider({
      estimateMicroUsd: (referenceCount) => referenceCount * 100_000,
      output: { bytes: await jpeg(768, 1_024), mimeType: "image/jpeg" },
      usage: {
        actualMicroUsd: 400_000,
        inputUnits: 3,
        outputUnits: 1,
        providerReported: true,
        usageVersion: "reported-v1",
      },
    });
    const test = await harness({ createProvider: async () => provider });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(200);
    expect(test.reservations[0]?.forecastMicroUsd).toBe(300_000);
    // A null actual makes ftt_ai_tryon_finalize settle the full reservation.
    expect(test.finalizations[0]).toMatchObject({
      actualMicroUsd: null,
      status: "succeeded",
    });
  });

  it("settles zero and never dispatches when product binding fails", async () => {
    const bindProduct = vi.fn(async () => false);
    const test = await harness({ bindProduct });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(503);
    expect(test.provider.requests).toHaveLength(0);
    expect(test.commitDailyQuota).not.toHaveBeenCalled();
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
    expect(test.finalizations).toEqual([
      expect.objectContaining({
        actualMicroUsd: 0,
        requestId: REQUEST_ID,
        status: "failed_pre_provider",
      }),
    ]);
  });

  it("charges nothing to the provider when the circuit is open", async () => {
    const test = await harness({
      checkProviderCircuit: async () => ({
        allowed: false,
        retryAfterSeconds: 120,
      }),
    });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(503);
    expect(test.provider.requests).toHaveLength(0);
    expect(test.reservations).toHaveLength(0);
    expect(test.finalizations).toHaveLength(0);
    expect(test.commitDailyQuota).not.toHaveBeenCalled();
  });

  it("charges nothing a second time for a duplicate idempotency key", async () => {
    const test = await harness({
      reserveBudget: async (): Promise<BudgetReservation> => ({
        outcome: "duplicate",
        requestId: REQUEST_ID,
        requestStatus: "reserved",
      }),
    });

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );

    expect(response.status).toBe(409);
    expect(await errorBody(response)).toMatchObject({
      code: "TRYON_ALREADY_PROCESSING",
    });
    expect(test.provider.requests).toHaveLength(0);
    expect(test.bindProduct).not.toHaveBeenCalled();
    expect(test.finalizations).toHaveLength(0);
    expect(test.commitDailyQuota).not.toHaveBeenCalled();
    expect(test.releaseDailyQuota).toHaveBeenCalledOnce();
  });

  it("keeps image bytes, the raw IP and provider payloads out of every ledger value", async () => {
    const test = await harness();

    const response = await handleTryonGenerateRequest(
      await requestFor({ config: enabledConfig() }),
      test.dependencies,
    );
    expect(response.status).toBe(200);

    const ledgerPayload = [
      ...test.reservations,
      ...test.finalizations,
      ...test.bindProduct.mock.calls.flat(),
    ];
    const binaryValues: unknown[] = [];
    const walk = (value: unknown) => {
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        binaryValues.push(value);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const child of Object.values(value)) walk(child);
    };
    walk(ledgerPayload);

    expect(binaryValues).toHaveLength(0);
    const serialized = JSON.stringify(ledgerPayload);
    expect(serialized).not.toContain("203.0.113.10");
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("exactly two reference images");
    // JSON.stringify emits U+00FF/U+00D8 literally, so search for the real
    // characters: a latin-1 string of JPEG bytes would otherwise slip through.
    expect(serialized).not.toContain(String.fromCharCode(0xff, 0xd8, 0xff));
    // Every stored value is a bounded scalar: no object payload sneaks through.
    for (const entry of ledgerPayload) {
      for (const value of Object.values(entry as Record<string, unknown>)) {
        expect(["string", "number", "boolean", "object"]).toContain(
          typeof value,
        );
        if (value !== null && typeof value === "object") {
          throw new Error("ledger payloads must not carry nested objects");
        }
      }
    }
  });
});
