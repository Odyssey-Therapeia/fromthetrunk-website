import { z } from "@hono/zod-openapi";

import { createOrderSchema } from "./orders";

export const createPaymentOrderSchema = createOrderSchema;

export const verifyPaymentSchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().trim().min(1).max(128),
  razorpayPaymentId: z.string().trim().min(1).max(128),
  razorpaySignature: z.string().trim().min(1).max(256),
}).strict();
