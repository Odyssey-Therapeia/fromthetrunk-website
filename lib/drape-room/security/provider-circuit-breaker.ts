import { randomUUID } from "node:crypto";

import type { TryonRedisClient } from "@/lib/drape-room/security/redis-guard";
import type {
  DrapeProviderErrorCode,
  ImageProviderId,
} from "@/lib/drape-room/server/provider";

const PROVIDER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TRANSIENT_FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 5 * 60 * 1_000;
const TRANSIENT_OPEN_MS = 5 * 60 * 1_000;
const CONFIGURATION_OPEN_MS = 15 * 60 * 1_000;
const HALF_OPEN_PROBE_MS = 60 * 1_000;

// The open timestamp remains after its cooling period. Exactly one caller can
// then atomically own the half-open probe; all other instances remain blocked.
const CHECK_SCRIPT = `
  local state = redis.call('GET', KEYS[1])
  if not state then return {1, 0, ''} end

  local server_time = redis.call('TIME')
  local now_ms = (tonumber(server_time[1]) * 1000) + math.floor(tonumber(server_time[2]) / 1000)
  local open_until = tonumber(state)
  if not open_until then return {0, ARGV[2], ''} end
  if now_ms < open_until then return {0, open_until - now_ms, ''} end

  if redis.call('SET', KEYS[2], ARGV[1], 'NX', 'PX', ARGV[2]) then
    return {1, 0, state}
  end
  local probe_ttl = redis.call('PTTL', KEYS[2])
  if probe_ttl < 1 then probe_ttl = tonumber(ARGV[2]) end
  return {0, probe_ttl, ''}
`;

const RECORD_FAILURE_SCRIPT = `
  local failures = redis.call('INCR', KEYS[2])
  local ttl = redis.call('PTTL', KEYS[2])
  if failures == 1 or ttl < 0 then
    redis.call('PEXPIRE', KEYS[2], ARGV[2])
  end

  local recovering = redis.call('EXISTS', KEYS[1]) == 1
  if ARGV[1] == 'immediate' or recovering or failures >= tonumber(ARGV[3]) then
    local open_ms = ARGV[1] == 'immediate' and tonumber(ARGV[4]) or tonumber(ARGV[5])
    local server_time = redis.call('TIME')
    local now_ms = (tonumber(server_time[1]) * 1000) + math.floor(tonumber(server_time[2]) / 1000)
    local candidate_open_until = now_ms + open_ms
    local existing_open_until = tonumber(redis.call('GET', KEYS[1]))
    local open_until = candidate_open_until
    if existing_open_until and existing_open_until > open_until then
      open_until = existing_open_until
    end
    redis.call('SET', KEYS[1], tostring(open_until))
    redis.call('DEL', KEYS[2])
    if ARGV[6] ~= '' and redis.call('GET', KEYS[3]) == ARGV[6] then
      redis.call('DEL', KEYS[3])
    end
    return open_until - now_ms
  end
  return 0
`;

// A normal success clears only rolling failures. A half-open success closes
// the circuit only when both its lease and observed open-state version still
// match, so a late success cannot undo a newer distributed failure.
const RECORD_SUCCESS_SCRIPT = `
  if ARGV[1] == '' then
    redis.call('DEL', KEYS[3])
    return 0
  end
  if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
  if redis.call('GET', KEYS[1]) ~= ARGV[2] then
    redis.call('DEL', KEYS[2])
    return 0
  end
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return 1
`;

const RELEASE_PROBE_SCRIPT = `
  if ARGV[1] ~= '' and redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

export type ProviderCircuitProbe = {
  stateVersion: string;
  token: string;
};

export type ProviderCircuitAdmission =
  | { allowed: true; probe?: ProviderCircuitProbe; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

export type ProviderCircuitFailureCode = Extract<
  DrapeProviderErrorCode,
  | "authentication_failed"
  | "deadline_exceeded"
  | "invalid_response"
  | "model_not_found"
  | "rate_limited"
  | "upstream_unavailable"
>;

function circuitKeys(
  provider: ImageProviderId,
  model: string,
): [string, string, string] {
  if (!PROVIDER_MODEL_PATTERN.test(model)) {
    throw new Error("TRYON_INVALID_PROVIDER_CIRCUIT_INPUT");
  }
  const namespace = `ftt:tryon:v1:provider-circuit:${provider}:${model}`;
  return [
    `${namespace}:open`,
    `${namespace}:probe`,
    `${namespace}:failures`,
  ];
}

function retryAfterSeconds(milliseconds: unknown): number {
  const numeric = Number(milliseconds);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return 0;
  return Math.max(1, Math.ceil(numeric / 1_000));
}

function parseAdmission(
  value: unknown,
  probeToken: string,
): ProviderCircuitAdmission {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("TRYON_INVALID_PROVIDER_CIRCUIT_RESULT");
  }
  const allowed = Number(value[0]);
  const retryAfter = retryAfterSeconds(value[1]);
  const stateVersion = String(value[2] ?? "");
  if (allowed === 0 && retryAfter > 0) {
    return { allowed: false, retryAfterSeconds: retryAfter };
  }
  if (allowed !== 1 || retryAfter !== 0) {
    throw new Error("TRYON_INVALID_PROVIDER_CIRCUIT_RESULT");
  }
  return stateVersion
    ? {
        allowed: true,
        probe: { stateVersion, token: probeToken },
        retryAfterSeconds: 0,
      }
    : { allowed: true, retryAfterSeconds: 0 };
}

export function isProviderCircuitFailure(
  code: DrapeProviderErrorCode,
): code is ProviderCircuitFailureCode {
  return (
    code === "authentication_failed" ||
    code === "deadline_exceeded" ||
    code === "invalid_response" ||
    code === "model_not_found" ||
    code === "rate_limited" ||
    code === "upstream_unavailable"
  );
}

export async function checkProviderCircuit(
  redis: TryonRedisClient,
  provider: ImageProviderId,
  model: string,
): Promise<ProviderCircuitAdmission> {
  const [stateKey, probeKey] = circuitKeys(provider, model);
  const probeToken = randomUUID();
  return parseAdmission(
    await redis.eval(
      CHECK_SCRIPT,
      [stateKey, probeKey],
      [probeToken, HALF_OPEN_PROBE_MS],
    ),
    probeToken,
  );
}

export async function recordProviderCircuitFailure(
  redis: TryonRedisClient,
  provider: ImageProviderId,
  model: string,
  code: ProviderCircuitFailureCode,
  probe?: ProviderCircuitProbe,
): Promise<number> {
  const [stateKey, probeKey, failuresKey] = circuitKeys(provider, model);
  const immediate =
    code === "authentication_failed" || code === "model_not_found";
  return retryAfterSeconds(
    await redis.eval(
      RECORD_FAILURE_SCRIPT,
      [stateKey, failuresKey, probeKey],
      [
        immediate ? "immediate" : "threshold",
        FAILURE_WINDOW_MS,
        TRANSIENT_FAILURE_THRESHOLD,
        CONFIGURATION_OPEN_MS,
        TRANSIENT_OPEN_MS,
        probe?.token ?? "",
      ],
    ),
  );
}

export async function recordProviderCircuitSuccess(
  redis: TryonRedisClient,
  provider: ImageProviderId,
  model: string,
  probe?: ProviderCircuitProbe,
): Promise<void> {
  const [stateKey, probeKey, failuresKey] = circuitKeys(provider, model);
  await redis.eval(
    RECORD_SUCCESS_SCRIPT,
    [stateKey, probeKey, failuresKey],
    [probe?.token ?? "", probe?.stateVersion ?? ""],
  );
}

export async function releaseProviderCircuitProbe(
  redis: TryonRedisClient,
  provider: ImageProviderId,
  model: string,
  probe: ProviderCircuitProbe,
): Promise<void> {
  const [, probeKey] = circuitKeys(provider, model);
  await redis.eval(RELEASE_PROBE_SCRIPT, [probeKey], [probe.token]);
}

export const TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS = Object.freeze({
  check: CHECK_SCRIPT,
  recordFailure: RECORD_FAILURE_SCRIPT,
  recordSuccess: RECORD_SUCCESS_SCRIPT,
  releaseProbe: RELEASE_PROBE_SCRIPT,
});

export const TRYON_PROVIDER_CIRCUIT_POLICY = Object.freeze({
  configurationOpenMs: CONFIGURATION_OPEN_MS,
  failureWindowMs: FAILURE_WINDOW_MS,
  halfOpenProbeMs: HALF_OPEN_PROBE_MS,
  transientFailureThreshold: TRANSIENT_FAILURE_THRESHOLD,
  transientOpenMs: TRANSIENT_OPEN_MS,
});
