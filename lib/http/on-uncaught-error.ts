import type { ErrorHandler } from "hono";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:v2");

export const onUncaughtError: ErrorHandler = (error, c) => {
  log.error("Uncaught error", { err: error });
  return c.json({ code: "INTERNAL", message: "Unexpected server error." }, 500);
};
