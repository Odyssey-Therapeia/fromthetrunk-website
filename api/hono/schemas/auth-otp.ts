import { z } from "@hono/zod-openapi";

export const otpPurposeSchema = z.enum(["sign_in", "sign_up", "checkout"]);

export const startOtpSchema = z
  .object({
    identifier: z.string().trim().min(3).max(320),
    purpose: otpPurposeSchema,
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    challengeToken: z.string().trim().min(32).max(256),
    otp: z.string().trim().regex(/^\d{6}$/),
  })
  .strict();

const registrationAddressSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    isDefault: z.boolean().optional().default(false),
    label: z.string().trim().min(1).max(80),
    line1: z.string().trim().min(1).max(180),
    line2: z.string().trim().max(180).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1).max(40),
    postalCode: z.string().trim().min(1).max(40),
    state: z.string().trim().min(1).max(120),
  })
  .strict();

export const completeOtpRegistrationSchema = z
  .object({
    address: registrationAddressSchema.optional(),
    fullName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1).max(40),
    phoneCountry: z.string().trim().min(1).max(8).optional(),
    registrationToken: z.string().trim().min(32).max(256),
  })
  .strict();
