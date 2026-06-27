import { z } from "@hono/zod-openapi";

const sameOriginPathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?!\/)[^\s]*$/, "Use a site path only.")
  .optional();

export const siteFeedbackSubmitSchema = z.object({
  clientSubmissionId: z.string().trim().max(80).optional(),
  comment: z.string().trim().min(3).max(1200),
  pagePath: sameOriginPathSchema,
  rating: z
    .number()
    .min(1)
    .max(5)
    .refine(
      (value) => Math.abs(Math.round(value * 10) - value * 10) < 0.0001,
      "Rating must use one decimal place at most.",
    ),
  startedAt: z.number().int().positive().optional(),
  website: z.string().max(200).optional(),
});

export const siteFeedbackAdminQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  status: z.enum(["new", "reviewed", "archived", "spam"]).optional(),
});

export const siteFeedbackStatusPatchSchema = z.object({
  status: z.enum(["new", "reviewed", "archived", "spam"]),
});
