import { z } from "@hono/zod-openapi";

export const cartReservationSchema = z.object({
  productId: z.string().uuid(),
  // Compatibility field for existing storefront/dashboard clients. Unique
  // pre-loved inventory is still one-of-one; the route ignores this value.
  quantity: z.number().int().min(1).max(1).optional(),
  reservationToken: z.string().min(1).max(512).optional(),
}).strict();

/**
 * The authenticated bag's add request.
 *
 * Product and options only — the customer comes from the server session. A
 * userId a browser could send would let anyone fill anyone's bag.
 */
export const cartItemSchema = z
  .object({
    productId: z.string().uuid(),
    selectedOptions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const cartItemParamSchema = z.object({
  productId: z.string().uuid(),
});
