import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { sameOriginMutationGuard } from "@/api/hono/middleware/same-origin";
import type { HonoBindings } from "@/api/hono/types";

const buildApp = () => {
  const app = new Hono<HonoBindings>();
  app.use("*", sameOriginMutationGuard);
  app.post("/mutate", (c) => c.json({ ok: true }));
  return app;
};

describe("sameOriginMutationGuard", () => {
  it("blocks cross-site browser mutations", async () => {
    const app = buildApp();

    const response = await app.request("https://www.fromthetrunk.shop/mutate", {
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("allows same-origin browser mutations", async () => {
    const app = buildApp();

    const response = await app.request("https://www.fromthetrunk.shop/mutate", {
      headers: {
        origin: "https://www.fromthetrunk.shop",
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("allows server-to-server mutations without browser origin headers", async () => {
    const app = buildApp();

    const response = await app.request("https://www.fromthetrunk.shop/mutate", {
      method: "POST",
    });

    expect(response.status).toBe(200);
  });
});
