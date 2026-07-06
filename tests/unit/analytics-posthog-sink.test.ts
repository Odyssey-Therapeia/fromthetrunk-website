import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPosthogNodeSink } from "@/lib/adapters/posthog-node-sink";

/**
 * PostHog server sink — env gating. Verifies the sink is null without
 * POSTHOG_KEY, and that it returns a functional sink when set.
 */
describe("posthog-node sink env gating", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when POSTHOG_KEY is not set", () => {
    vi.stubEnv("POSTHOG_KEY", "");
    expect(buildPosthogNodeSink()).toBeNull();
  });

  it("returns a sink when POSTHOG_KEY is set", () => {
    vi.stubEnv("POSTHOG_KEY", "phc_test_key");
    const sink = buildPosthogNodeSink();
    expect(sink).not.toBeNull();
    expect(typeof sink?.emit).toBe("function");
  });
});
