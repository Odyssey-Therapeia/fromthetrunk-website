import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emailsSendMock = vi.hoisted(() => vi.fn());
const getResendClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email/resend", () => ({
  FROM_EMAIL: "From the Trunk <hello@fromthetrunk.shop>",
  getResendClient: getResendClientMock,
}));

// Mock the logger to capture log.error calls
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  }),
}));

import { sendEmail } from "@/lib/email/send";

describe("sendEmail (Resend path)", () => {
  beforeEach(() => {
    emailsSendMock.mockReset();
    getResendClientMock.mockReset();
    logErrorMock.mockReset();
    getResendClientMock.mockReturnValue({
      emails: { send: emailsSendMock },
    });
    process.env.RESEND_API_KEY = "re_test_key";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("returns false and logs when Resend returns an error", async () => {
    emailsSendMock.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith(
      "Resend error",
      expect.objectContaining({ message: "domain not verified" }),
    );
  });

  it("returns true when Resend returns data without an error", async () => {
    emailsSendMock.mockResolvedValue({
      data: { id: "msg_abc123" },
      error: null,
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(true);
    expect(logErrorMock).not.toHaveBeenCalled();
    expect(emailsSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["customer@example.com"],
        subject: "Test",
      }),
    );
  });

  it("forwards a stable idempotency key to Resend", async () => {
    emailsSendMock.mockResolvedValue({
      data: { id: "msg_abc123" },
      error: null,
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Back in stock",
      html: "<p>Your saved piece is available.</p>",
      idempotencyKey: "restock-abc123",
    });

    expect(result).toBe(true);
    expect(emailsSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["customer@example.com"] }),
      { idempotencyKey: "restock-abc123" },
    );
  });
});

describe("sendEmail provider selection", () => {
  const createTransportMock = vi.fn();
  const sendMailMock = vi.fn();

  const clearTransportEnv = () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PORT;
  };

  const stubSmtpEnv = () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "mailer@example.test");
    vi.stubEnv("SMTP_PASSWORD", "smtp-test-password");
  };

  // nodemailer is imported lazily inside sendEmail, so mock it before a fresh
  // module load.
  const loadSendEmail = async () => {
    vi.doMock("nodemailer", () => ({
      default: { createTransport: createTransportMock },
    }));
    return (await import("@/lib/email/send")).sendEmail;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearTransportEnv();
    emailsSendMock.mockReset();
    getResendClientMock.mockReset();
    logErrorMock.mockReset();
    createTransportMock.mockReset();
    sendMailMock.mockReset();
    getResendClientMock.mockReturnValue({
      emails: { send: emailsSendMock },
    });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  });

  afterEach(() => {
    vi.doUnmock("nodemailer");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("uses Resend and never builds an SMTP transport when both are configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    stubSmtpEnv();
    vi.stubEnv("SMTP_PORT", "587");
    emailsSendMock.mockResolvedValue({
      data: { id: "msg_abc123" },
      error: null,
    });

    const send = await loadSendEmail();
    const result = await send({
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(true);
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it.each([
    { rawPort: undefined, port: 465, secure: true },
    { rawPort: "587", port: 587, secure: false },
  ])(
    "sends through SMTP without RESEND_API_KEY (SMTP_PORT=$rawPort -> port $port, secure $secure)",
    async ({ rawPort, port, secure }) => {
      stubSmtpEnv();
      if (rawPort) vi.stubEnv("SMTP_PORT", rawPort);
      sendMailMock.mockResolvedValue({ messageId: "<smtp-test@example.test>" });

      const send = await loadSendEmail();
      const result = await send({
        to: [" first@example.com ", "second@example.com"],
        subject: "SMTP test",
        html: "<p>Hello</p>",
      });

      expect(result).toBe(true);
      expect(getResendClientMock).not.toHaveBeenCalled();
      expect(createTransportMock).toHaveBeenCalledWith({
        auth: {
          pass: "smtp-test-password",
          user: "mailer@example.test",
        },
        host: "smtp.example.test",
        port,
        secure,
      });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: "<p>Hello</p>",
          subject: "SMTP test",
          to: "first@example.com, second@example.com",
        }),
      );
    },
  );

  it("returns false when the SMTP transport rejects the message", async () => {
    stubSmtpEnv();
    sendMailMock.mockRejectedValue(new Error("535 authentication failed"));

    const send = await loadSendEmail();
    const result = await send({
      to: "customer@example.com",
      subject: "SMTP test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock).toHaveBeenCalledWith(
      "Failed to send email",
      expect.anything(),
    );
  });
});
