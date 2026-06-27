import { z } from "zod";

export const MAX_ORDER_ITEMS = 20;

export const orderItemSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(1),
    reservationToken: z.string().min(1).optional(),
  });

export const shippingAddressSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    line1: z.string().trim().min(1).max(180),
    line2: z.string().trim().max(180).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    postalCode: z.string().trim().min(1).max(40),
    state: z.string().trim().max(120).optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    items: z
      .array(orderItemSchema)
      .min(1)
      .max(MAX_ORDER_ITEMS)
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        for (const [index, item] of items.entries()) {
          if (seen.has(item.productId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Duplicate products are not allowed in one order.",
              path: [index, "productId"],
            });
          }
          seen.add(item.productId);
        }
      }),
    shippingAddress: shippingAddressSchema,
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
