import { z } from "@hono/zod-openapi";

import { createOrderSchema } from "./orders";

export const createPaymentOrderSchema = createOrderSchema;

export const verifyPaymentSchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().trim().min(1).max(128).optional(),
  razorpayPaymentId: z.string().trim().min(1).max(128).optional(),
  razorpaySignature: z.string().trim().min(1).max(256).optional(),
  razorpay_order_id: z.string().trim().min(1).max(128).optional(),
  razorpay_payment_id: z.string().trim().min(1).max(128).optional(),
  razorpay_signature: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((value, ctx) => {
  const razorpayOrderId = value.razorpayOrderId ?? value.razorpay_order_id;
  const razorpayPaymentId = value.razorpayPaymentId ?? value.razorpay_payment_id;
  const razorpaySignature = value.razorpaySignature ?? value.razorpay_signature;

  if (!razorpayOrderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Razorpay order id is required.",
      path: ["razorpayOrderId"],
    });
  }
  if (!razorpayPaymentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Razorpay payment id is required.",
      path: ["razorpayPaymentId"],
    });
  }
  if (!razorpaySignature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Razorpay signature is required.",
      path: ["razorpaySignature"],
    });
  }
});
