import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  contactAdminQuerySchema,
  contactStatusPatchSchema,
  contactSubmitSchema,
} from "@/api/hono/schemas/contact";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import {
  createContactSubmission,
  findRecentContactDuplicate,
  listContactSubmissionsForAdmin,
  markContactAcknowledgementSent,
  markContactInternalNotificationSent,
  updateContactSubmissionStatus,
} from "@/db/queries/contact-submissions";
import { getOrderNotificationRecipients } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/send";
import {
  contactAcknowledgementEmail,
  contactInternalNotificationEmail,
} from "@/lib/email/templates";
import { checkRateLimit, rateLimitResponse } from "@/lib/http/rate-limit";
import { createLogger } from "@/lib/log";
import { hashIp, hashUserAgent } from "@/lib/auth/otp";

const log = createLogger("contact:submit");
const SUCCESS_MESSAGE =
  "Thanks for reaching out — we’ve received your request. Our team will contact you shortly.";
const SUPPORT_EMAIL = "hello@fromthetrunk.shop";
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

const normalizeMessage = (message: string) =>
  message.trim().replace(/\s+/g, " ").toLowerCase();

const hashStable = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const getHourBucket = (now = Date.now()) => Math.floor(now / (60 * 60 * 1000));

const getMessageHash = (email: string, message: string, now = Date.now()) =>
  hashStable(`${email}:${normalizeMessage(message)}:${getHourBucket(now)}`);

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

export const registerContactRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/submit",
      request: {
        body: {
          content: { "application/json": { schema: contactSubmitSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Contact request accepted" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        429: { description: "Too many contact requests" },
      },
      tags: ["Contact"],
    }),
    async (c) => {
      const ipLimited = await rateLimitResponse(c.req.raw, "contact:submit:ip", {
        limit: 5,
        requireDurable: true,
        windowSeconds: 10 * 60,
      });
      if (ipLimited) return ipLimited;

      const body = c.req.valid("json");
      if (isLikelyBot(body)) {
        return c.json(safeSuccess(), 200);
      }

      const emailHash = hashStable(body.email);
      const emailLimited = await rateLimitByKey(
        `contact:submit:email:${emailHash}`,
        3,
        60 * 60,
      );
      if (emailLimited) return emailLimited;

      const messageHash = getMessageHash(body.email, body.message);
      const recentDuplicate = await findRecentContactDuplicate({
        email: body.email,
        messageHash,
        since: new Date(Date.now() - DUPLICATE_WINDOW_MS),
      });
      if (recentDuplicate) {
        return c.json(safeSuccess(), 200);
      }

      const submission = await createContactSubmission({
        email: body.email,
        ipHash: hashIp(getClientIp(c.req.raw)),
        message: body.message,
        messageHash,
        metadata: body.clientSubmissionId
          ? { clientSubmissionId: body.clientSubmissionId }
          : null,
        name: body.name,
        pagePath: body.pagePath ?? null,
        phone: body.phone ?? null,
        topic: body.topic ?? null,
        userAgentHash: hashUserAgent(c.req.header("user-agent")),
      });

      const acknowledgement = contactAcknowledgementEmail({
        name: body.name,
        supportEmail: SUPPORT_EMAIL,
      });
      const acknowledgementSent = await sendEmail({
        html: acknowledgement.html,
        subject: acknowledgement.subject,
        to: body.email,
      });
      if (acknowledgementSent) {
        await markContactAcknowledgementSent(submission.id);
      } else {
        log.warn("Contact acknowledgement email failed", {
          submissionId: submission.id,
        });
      }

      const internal = contactInternalNotificationEmail({
        email: body.email,
        message: body.message,
        name: body.name,
        pagePath: body.pagePath ?? null,
        phone: body.phone ?? null,
        submissionId: submission.id,
        topic: body.topic ?? null,
      });
      const internalSent = await sendEmail({
        html: internal.html,
        subject: internal.subject,
        to: getOrderNotificationRecipients(),
      });
      if (internalSent) {
        await markContactInternalNotificationSent(submission.id);
      } else {
        log.warn("Contact internal notification email failed", {
          submissionId: submission.id,
        });
      }

      return c.json(safeSuccess(), 200);
    },
  );
};

export const registerAdminContactSubmissionRoutes = (
  app: OpenAPIHono<HonoBindings>,
) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: { query: contactAdminQuerySchema },
      responses: {
        200: { description: "Contact submissions" },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unauthorized",
        },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
      },
      tags: ["Admin Contact"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const query = c.req.valid("query");
      const rows = await listContactSubmissionsForAdmin(query);
      return c.json({ items: rows, limit: query.limit ?? 25, page: query.page ?? 1 }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: { "application/json": { schema: contactStatusPatchSchema } },
          required: true,
        },
        params: idParamSchema,
      },
      responses: {
        200: { description: "Contact submission updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Contact"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const row = await updateContactSubmissionStatus(id, status);
      if (!row) {
        return c.json(
          { code: "CONTACT_SUBMISSION_NOT_FOUND", message: "Submission not found." },
          404,
        );
      }

      return c.json({ id: row.id, status: row.status, updatedAt: row.updatedAt }, 200);
    },
  );
};
