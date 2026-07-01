import { handle } from "hono/vercel";

import app from "@/api/hono/site-app";

export const maxDuration = 120;

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const PUT = handle(app);
export const OPTIONS = handle(app);
