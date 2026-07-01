import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";

export const registerSecurityRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.post("/csp-report", () =>
    new Response(null, {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 204,
    }),
  );
};
