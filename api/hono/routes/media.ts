import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { deleteMedia, listMedia } from "@/db/queries/media";
import { createMediaFromUpload, generateUploadUrl, MAX_IMAGE_BYTES } from "@/lib/media/blob-upload";

const uploadRequestSchema = z.object({
  contentType: z.string().trim().min(1).max(120),
  filename: z.string().trim().min(1).max(180),
});

export const completeUploadSchema = z.object({
  alt: z.string().trim().min(1, "Alt text is required for accessibility").max(180),
  filename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  pathname: z.string().trim().min(1).max(512),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  url: z.string().trim().url().max(2048),
});

export const registerMediaRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Media list" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const media = await listMedia();
      return c.json(media, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/upload",
      request: {
        body: {
          content: {
            "application/json": { schema: uploadRequestSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Upload URL generated" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const upload = await generateUploadUrl({
        contentType: body.contentType,
        filename: body.filename,
      });

      return c.json(upload, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/complete",
      request: {
        body: {
          content: {
            "application/json": { schema: completeUploadSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Media created" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      let media: Awaited<ReturnType<typeof createMediaFromUpload>>;
      try {
        media = await createMediaFromUpload(body);
      } catch (error) {
        if (error instanceof Error && error.name === "MediaUploadValidationError") {
          return c.json(
            {
              code: "MEDIA_UPLOAD_REJECTED",
              message: error.message,
            },
            400
          );
        }
        throw error;
      }
      return c.json(media, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Media deleted" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Media not found",
        },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      const deleted = await deleteMedia(id);
      if (!deleted) {
        return c.json(
          {
            code: "MEDIA_NOT_FOUND",
            message: "Media not found.",
          },
          404
        );
      }

      return c.json({ success: true }, 200);
    }
  );
};
