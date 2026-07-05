import { z } from "@hono/zod-openapi";

export const cartReservationSchema = z.object({
  productId: z.string().uuid(),
  // Compatibility field for existing storefront/dashboard clients. Unique
  // pre-loved inventory is still one-of-one; the route ignores this value.
  quantity: z.number().int().min(1).max(1).optional(),
  reservationToken: z.string().min(1).max(512).optional(),
}).strict();
