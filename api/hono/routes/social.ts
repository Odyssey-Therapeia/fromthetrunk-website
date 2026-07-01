import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { getLatestReel } from "@/lib/social/latest-reel";

export const registerSocialRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/latest-reel", async () => Response.json(await getLatestReel()));
};
