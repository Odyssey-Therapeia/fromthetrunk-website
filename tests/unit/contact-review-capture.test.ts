import { describe, expect, it, vi, beforeEach } from "vitest";

import { contactSubmitSchema } from "@/api/hono/schemas/contact";
import { siteFeedbackSubmitSchema } from "@/api/hono/schemas/site-feedback";
import { createRouteHarness } from "@/tests/helpers/route-harness";

const contactQueries = vi.hoisted(() => ({
  createContactSubmission: vi.fn(),
  findRecentContactDuplicate: vi.fn(),
  listContactSubmissionsForAdmin: vi.fn(),
  markContactAcknowledgementSent: vi.fn(),
  markContactInternalNotificationSent: vi.fn(),
  updateContactSubmissionStatus: vi.fn(),
}));

const feedbackQueries = vi.hoisted(() => ({
  createSiteFeedbackSubmission: vi.fn(),
  findRecentSiteFeedbackDuplicate: vi.fn(),
  listSiteFeedbackForAdmin: vi.fn(),
  updateSiteFeedbackStatus: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/db/queries/contact-submissions", () => contactQueries);
vi.mock("@/db/queries/site-feedback", () => feedbackQueries);
vi.mock("@/lib/email/send", () => emailMocks);
vi.mock("@/lib/email/recipients", () => ({
  getOrderNotificationRecipients: () => ["hello@fromthetrunk.shop"],
}));
vi.mock("@/lib/http/rate-limit", () => rateLimitMocks);

import { registerContactRoutes } from "@/api/hono/routes/contact";
import { registerSiteFeedbackRoutes } from "@/api/hono/routes/site-feedback";

const CONTACT_SUCCESS =
  "Thanks for reaching out — we’ve received your request. Our team will contact you shortly.";
const FEEDBACK_SUCCESS = "Thank you for sharing your story. We’ll use it to do better.";

beforeEach(() => {
  process.env.AUTH_OTP_TOKEN_SECRET = "test-token-secret-32-characters-long";
  vi.clearAllMocks();
  rateLimitMocks.rateLimitResponse.mockResolvedValue(null);
  rateLimitMocks.checkRateLimit.mockResolvedValue({
    remaining: 9,
    resetAt: Date.now() + 60_000,
    success: true,
  });
  emailMocks.sendEmail.mockResolvedValue(true);
  contactQueries.findRecentContactDuplicate.mockResolvedValue(null);
  contactQueries.createContactSubmission.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
  });
  contactQueries.markContactAcknowledgementSent.mockResolvedValue({});
  contactQueries.markContactInternalNotificationSent.mockResolvedValue({});
  feedbackQueries.findRecentSiteFeedbackDuplicate.mockResolvedValue(null);
  feedbackQueries.createSiteFeedbackSubmission.mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
  });
});

describe("contact and review schemas", () => {
  it("contact rejects invalid email", () => {
    expect(
      contactSubmitSchema.safeParse({
        email: "not-an-email",
        message: "I am looking for a silk saree.",
        name: "Meena",
      }).success,
    ).toBe(false);
  });

  it("contact rejects message too long", () => {
    expect(
      contactSubmitSchema.safeParse({
        email: "meena@example.com",
        message: "x".repeat(2001),
        name: "Meena",
      }).success,
    ).toBe(false);
  });

  it("contact rejects external pagePath", () => {
    expect(
      contactSubmitSchema.safeParse({
        email: "meena@example.com",
        message: "I am looking for a silk saree.",
        name: "Meena",
        pagePath: "https://evil.example/path",
      }).success,
    ).toBe(false);
  });

  it("feedback rejects rating outside 1..5", () => {
    expect(
      siteFeedbackSubmitSchema.safeParse({
        comment: "Loved it",
        rating: 6,
      }).success,
    ).toBe(false);
  });

  it("feedback accepts one-decimal ratings", () => {
    expect(
      siteFeedbackSubmitSchema.safeParse({
        comment: "Loved it",
        rating: 4.8,
      }).success,
    ).toBe(true);
  });

  it("feedback rejects comment too long", () => {
    expect(
      siteFeedbackSubmitSchema.safeParse({
        comment: "x".repeat(1201),
        rating: 5,
      }).success,
    ).toBe(false);
  });
});

describe("POST /contact/submit", () => {
  const validPayload = () => ({
    email: "CUSTOMER@EXAMPLE.COM",
    message: "I am looking for a Kanjivaram saree for a family event.",
    name: "Customer Name",
    pagePath: "/collection?fabric=silk",
    phone: "+91 99999 99999",
    startedAt: Date.now() - 3000,
    topic: "Styling",
    website: "",
  });

  it("creates a DB row and sends acknowledgement plus internal notification", async () => {
    const harness = createRouteHarness({ register: registerContactRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "vitest",
        "x-real-ip": "203.0.113.10",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: CONTACT_SUCCESS,
      ok: true,
    });
    expect(contactQueries.createContactSubmission).toHaveBeenCalledOnce();
    expect(contactQueries.createContactSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "customer@example.com",
        message: validPayload().message,
        name: "Customer Name",
      }),
    );
    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(contactQueries.markContactAcknowledgementSent).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(contactQueries.markContactInternalNotificationSent).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("returns fake success without insert or email for honeypot submissions", async () => {
    const harness = createRouteHarness({ register: registerContactRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify({ ...validPayload(), website: "bot-site" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: CONTACT_SUCCESS,
      ok: true,
    });
    expect(contactQueries.createContactSubmission).not.toHaveBeenCalled();
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("dedupes duplicate submissions within the window", async () => {
    contactQueries.findRecentContactDuplicate.mockResolvedValueOnce({
      id: "existing-contact",
    });

    const harness = createRouteHarness({ register: registerContactRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(contactQueries.createContactSubmission).not.toHaveBeenCalled();
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("still returns success when email fails after DB insert", async () => {
    emailMocks.sendEmail.mockResolvedValue(false);

    const harness = createRouteHarness({ register: registerContactRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: CONTACT_SUCCESS,
      ok: true,
    });
    expect(contactQueries.createContactSubmission).toHaveBeenCalledOnce();
    expect(contactQueries.markContactAcknowledgementSent).not.toHaveBeenCalled();
    expect(contactQueries.markContactInternalNotificationSent).not.toHaveBeenCalled();
  });

  it("returns a safe 429 when the email rate limit blocks", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({
      remaining: 0,
      resetAt: Date.now() + 60_000,
      success: false,
    });

    const harness = createRouteHarness({ register: registerContactRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    });
    expect(contactQueries.createContactSubmission).not.toHaveBeenCalled();
  });
});

describe("POST /site-feedback/submit", () => {
  const validPayload = () => ({
    comment: "The buying experience felt personal and calm.",
    pagePath: "/",
    rating: 5,
    startedAt: Date.now() - 3000,
    website: "",
  });

  it("creates a DB row and does not send email", async () => {
    const harness = createRouteHarness({ register: registerSiteFeedbackRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "vitest",
        "x-real-ip": "203.0.113.11",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: FEEDBACK_SUCCESS,
      ok: true,
    });
    expect(feedbackQueries.createSiteFeedbackSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: validPayload().comment,
        rating: 5,
      }),
    );
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("dedupes duplicate review submits within the window", async () => {
    feedbackQueries.findRecentSiteFeedbackDuplicate.mockResolvedValueOnce({
      id: "existing-feedback",
    });

    const harness = createRouteHarness({ register: registerSiteFeedbackRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify(validPayload()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(feedbackQueries.createSiteFeedbackSubmission).not.toHaveBeenCalled();
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns fake success without insert for honeypot submissions", async () => {
    const harness = createRouteHarness({ register: registerSiteFeedbackRoutes });
    const response = await harness.request("/submit", {
      body: JSON.stringify({ ...validPayload(), website: "bot-site" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(feedbackQueries.createSiteFeedbackSubmission).not.toHaveBeenCalled();
  });
});
