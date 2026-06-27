import type { ErrorHandler } from "hono";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:v2");

export const onUncaughtError: ErrorHandler = (error, c) => {
  const requestId =
    typeof c.req?.header === "function" ? c.req.header("x-request-id") ?? null : null;

  log.error("Uncaught error", {
    err: error,
    requestId,
    source: "onUncaughtError",
  });
  return c.json({ code: "INTERNAL", message: "Unexpected server error." }, 500);
};
