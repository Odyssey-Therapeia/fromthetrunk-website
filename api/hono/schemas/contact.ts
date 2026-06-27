import { z } from "@hono/zod-openapi";

const sameOriginPathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?!\/)[^\s]*$/, "Use a site path only.")
  .optional();

export const contactSubmitSchema = z.object({
  clientSubmissionId: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(254).toLowerCase(),
  message: z.string().trim().min(10).max(2000),
  name: z.string().trim().min(2).max(80),
  pagePath: sameOriginPathSchema,
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+\d\s().-]*$/, "Use a valid phone number.")
    .optional()
    .transform((value) => (value ? value : undefined)),
  startedAt: z.number().int().positive().optional(),
  topic: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : undefined)),
  website: z.string().max(200).optional(),
});

export const contactAdminQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  status: z.enum(["new", "contacted", "closed", "spam"]).optional(),
});

export const contactStatusPatchSchema = z.object({
  status: z.enum(["new", "contacted", "closed", "spam"]),
});
