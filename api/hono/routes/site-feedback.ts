import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import {
  siteFeedbackAdminQuerySchema,
  siteFeedbackStatusPatchSchema,
  siteFeedbackSubmitSchema,
} from "@/api/hono/schemas/site-feedback";
import type { HonoBindings } from "@/api/hono/types";
import {
  createSiteFeedbackSubmission,
  findRecentSiteFeedbackDuplicate,
  listSiteFeedbackForAdmin,
  updateSiteFeedbackStatus,
} from "@/db/queries/site-feedback";
import { hashIp, hashUserAgent } from "@/lib/auth/otp";
import { checkRateLimit, rateLimitResponse } from "@/lib/http/rate-limit";

const SUCCESS_MESSAGE = "Thank you for sharing your story. We’ll use it to do better.";
const MIN_FORM_DWELL_MS = 2000;
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

const safeSuccess = () => ({
  message: SUCCESS_MESSAGE,
  ok: true,
});

const getClientIp = (request: Request): string | null => {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || null;
};

const hashStable = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const normalizeComment = (comment: string) =>
  comment.trim().replace(/\s+/g, " ").toLowerCase();

const getCommentHash = (rating: number, comment: string, pagePath: null | string) =>
  hashStable(`${rating}:${normalizeComment(comment)}:${pagePath ?? "/"}`);

const isLikelyBot = (body: { startedAt?: number; website?: string }) => {
  if (body.website?.trim()) return true;
  if (!body.startedAt) return false;
  return Date.now() - body.startedAt < MIN_FORM_DWELL_MS;
};

const rateLimitByKey = async (key: string, limit: number, windowSeconds: number) => {
  const result = await checkRateLimit(key, {
    limit,
    requireDurable: true,
    windowSeconds,
  });

  if (result.success) return null;

  return new Response(
    JSON.stringify({
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
      },
      status: 429,
    },
  );
};

export const registerSiteFeedbackRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/submit",
      request: {
        body: {
          content: { "application/json": { schema: siteFeedbackSubmitSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Feedback accepted" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        429: { description: "Too many feedback submissions" },
      },
      tags: ["Site Feedback"],
    }),
    async (c) => {
      const ipLimited = await rateLimitResponse(c.req.raw, "site-feedback:submit:ip", {
        limit: 10,
        requireDurable: true,
        windowSeconds: 10 * 60,
      });
      if (ipLimited) return ipLimited;

      const body = c.req.valid("json");
      if (isLikelyBot(body)) {
        return c.json(safeSuccess(), 200);
      }

      const pagePath = body.pagePath ?? null;
      const commentHash = getCommentHash(body.rating, body.comment, pagePath);
      const commentLimited = await rateLimitByKey(
        `site-feedback:submit:comment:${commentHash}`,
        3,
        60 * 60,
      );
      if (commentLimited) return commentLimited;

      const recentDuplicate = await findRecentSiteFeedbackDuplicate({
        commentHash,
        pagePath,
        rating: body.rating,
        since: new Date(Date.now() - DUPLICATE_WINDOW_MS),
      });
      if (recentDuplicate) {
        return c.json(safeSuccess(), 200);
      }

      await createSiteFeedbackSubmission({
        comment: body.comment,
        commentHash,
        ipHash: hashIp(getClientIp(c.req.raw)),
        metadata: body.clientSubmissionId
          ? { clientSubmissionId: body.clientSubmissionId }
          : null,
        pagePath,
        rating: body.rating,
        userAgentHash: hashUserAgent(c.req.header("user-agent")),
      });

      return c.json(safeSuccess(), 200);
    },
  );
};

export const registerAdminSiteFeedbackRoutes = (
  app: OpenAPIHono<HonoBindings>,
) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: { query: siteFeedbackAdminQuerySchema },
      responses: {
        200: { description: "Site feedback submissions" },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unauthorized",
        },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
      },
      tags: ["Admin Site Feedback"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const query = c.req.valid("query");
      const rows = await listSiteFeedbackForAdmin(query);
      return c.json({ items: rows, limit: query.limit ?? 25, page: query.page ?? 1 }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": { schema: siteFeedbackStatusPatchSchema },
          },
          required: true,
        },
        params: idParamSchema,
      },
      responses: {
        200: { description: "Site feedback updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Site Feedback"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const row = await updateSiteFeedbackStatus(id, status);
      if (!row) {
        return c.json(
          { code: "SITE_FEEDBACK_NOT_FOUND", message: "Feedback not found." },
          404,
        );
      }

      return c.json({ id: row.id, status: row.status, updatedAt: row.updatedAt }, 200);
    },
  );
};
