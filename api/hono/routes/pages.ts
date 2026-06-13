/**
 * P3-04: Admin pages CRUD routes.
 *
 * Endpoints (all under /pages when mounted):
 *   GET    /                             — list all pages (admin)
 *   POST   /                             — create page (admin; rejects reserved slugs → 409)
 *   GET    /:id                          — get page by id (admin)
 *   PATCH  /:id                          — update page title/seo (admin)
 *   GET    /:id/versions                 — list versions for page (admin)
 *   POST   /:id/versions                 — create version for page (admin)
 *   POST   /:id/versions/:versionId/restore — publish a specific version (admin)
 *
 * The `store` parameter is optional and defaults to the Drizzle adapter.
 * Pass `createInMemoryContentStore()` in tests.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import type { ContentStore } from "@/lib/ports/content-store";
import { createLogger } from "@/lib/log";

const log = createLogger("admin:pages");

// ── Local schemas ─────────────────────────────────────────────────────────────

const createPageBodySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
    })
    .optional()
    .nullable(),
});

const updatePageBodySchema = z.object({
  title: z.string().min(1).optional(),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
    })
    .optional()
    .nullable(),
});

const createVersionBodySchema = z.object({
  blocks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

const versionRestoreParamSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

// ── Route factory ─────────────────────────────────────────────────────────────

export const registerPagesRoutes = (
  app: OpenAPIHono<HonoBindings>,
  store?: ContentStore
) => {
  // Cache the lazily-resolved production store (one instance per registration).
  let _prodStore: ContentStore | undefined;

  // Lazily resolve the store so the Drizzle import (and DB connection) is
  // deferred. When `store` is injected (tests) it is used directly.
  async function resolveStore(): Promise<ContentStore> {
    if (store) return store;
    if (_prodStore) return _prodStore;
    const { createDrizzleContentStore } = await import(
      "@/lib/adapters/drizzle-content-store"
    );
    _prodStore = createDrizzleContentStore();
    return _prodStore;
  }

  // ── GET / — list pages ─────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "All pages" },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const cs = await resolveStore();
        const pages = await cs.listPages();
        return c.json(pages, 200);
      } catch (err) {
        log.error("Failed to list pages", { err: err as Record<string, unknown> });
        return c.json({ code: "LIST_FAILED", message: "Failed to list pages." }, 500);
      }
    }
  );

  // ── POST / — create page ───────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: createPageBodySchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Page created" },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Reserved slug or duplicate",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");

      try {
        const cs = await resolveStore();
        const page = await cs.createPage({
          slug: body.slug,
          title: body.title,
          seo: body.seo ?? null,
        });
        return c.json(page, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create page.";
        // Reserved-slug errors come from the store with "reserved" in the message.
        if (/reserved/i.test(message)) {
          return c.json(
            {
              code: "SLUG_RESERVED",
              message,
            },
            409
          );
        }
        log.error("Failed to create page", { err: err as Record<string, unknown> });
        return c.json({ code: "CREATE_FAILED", message }, 500);
      }
    }
  );

  // ── GET /:id — get page by id ──────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/:id",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const cs = await resolveStore();
      const page = await cs.getPageById(id);
      if (!page) {
        return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
      }
      return c.json(page, 200);
    }
  );

  // ── PATCH /:id — update page ───────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "patch",
      path: "/:id",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: updatePageBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Page updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      try {
        const cs = await resolveStore();
        const updated = await cs.updatePage(id, {
          title: body.title,
          seo: body.seo ?? undefined,
        });
        if (!updated) {
          return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
        }
        return c.json(updated, 200);
      } catch (err) {
        log.error("Failed to update page", { err: err as Record<string, unknown> });
        return c.json({ code: "UPDATE_FAILED", message: "Failed to update page." }, 500);
      }
    }
  );

  // ── GET /:id/versions — list versions ─────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/:id/versions",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page versions, newest first" },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const versions = await cs.listPageVersions(id);
        return c.json(versions, 200);
      } catch (err) {
        log.error("Failed to list versions", { err: err as Record<string, unknown> });
        return c.json(
          { code: "LIST_VERSIONS_FAILED", message: "Failed to list versions." },
          500
        );
      }
    }
  );

  // ── POST /:id/versions — create version ────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/versions",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: createVersionBodySchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Version created" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const authUser = c.get("authUser");

      const cs = await resolveStore();

      // Verify page exists
      const page = await cs.getPageById(id);
      if (!page) {
        return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
      }

      try {
        const version = await cs.createPageVersion({
          pageId: id,
          blocks: body.blocks,
          createdBy: authUser?.id ?? "unknown",
        });
        return c.json(version, 201);
      } catch (err) {
        log.error("Failed to create version", { err: err as Record<string, unknown> });
        return c.json(
          { code: "CREATE_VERSION_FAILED", message: "Failed to create version." },
          500
        );
      }
    }
  );

  // ── POST /:id/versions/:versionId/restore — restore/publish ───────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/versions/:versionId/restore",
      request: { params: versionRestoreParamSchema },
      responses: {
        200: { description: "Page published to the chosen version" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id, versionId } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const updated = await cs.publishPage(id, versionId);
        return c.json(updated, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to restore version.";
        if (/not found/i.test(message)) {
          return c.json({ code: "PAGE_NOT_FOUND", message }, 404);
        }
        log.error("Failed to restore version", { err: err as Record<string, unknown> });
        return c.json({ code: "RESTORE_FAILED", message }, 500);
      }
    }
  );
};
