import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  maxDuration,
  runtime,
} from "@/app/api/cron/tryon-reconcile/route";
import { handleTryonReconciliationRequest } from "@/lib/drape-room/server/reconciliation";

const URL = "https://www.fromthetrunk.shop/api/cron/tryon-reconcile";

function request(secret?: string): Request {
  return new Request(URL, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("Drape Room stale-ledger reconciliation cron", () => {
  it("is a bounded Node cron scheduled hourly", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/tryon-reconcile",
      schedule: "0 * * * *",
    });
  });

  it("fails closed when CRON_SECRET is absent or invalid", async () => {
    const reconcile = vi.fn();
    const missing = await handleTryonReconciliationRequest(request(), {
      cronSecret: "",
      reconcile,
    });
    expect(missing.status).toBe(500);
    await expect(missing.json()).resolves.toMatchObject({
      code: "CRON_SECRET_MISSING",
    });

    const unauthorized = await handleTryonReconciliationRequest(request(), {
      cronSecret: "correct-secret",
      reconcile,
    });
    expect(unauthorized.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("runs reconciliation once with valid authorization and disables caching", async () => {
    const reconcile = vi.fn(async () => ({
      periods: ["2026-08", "2026-09"],
      processedPeriods: 2,
    }));
    const response = await handleTryonReconciliationRequest(
      request("correct-secret"),
      {
        cronSecret: "correct-secret",
        now: () => Date.UTC(2026, 8, 1),
        reconcile,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      completedAt: "2026-09-01T00:00:00.000Z",
      ok: true,
      processedPeriods: 2,
    });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("returns a sanitized error if database reconciliation fails", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const response = await handleTryonReconciliationRequest(
      request("correct-secret"),
      {
        cronSecret: "correct-secret",
        reconcile: async () => {
          throw new Error("database-password-must-not-leak");
        },
      },
    );
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("RECONCILIATION_FAILED");
    expect(body).not.toContain("database-password-must-not-leak");
    expect(stdout.mock.calls.map(([value]) => String(value)).join("\n")).not.toContain(
      "database-password-must-not-leak",
    );
  });
});
