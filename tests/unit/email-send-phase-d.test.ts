import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Phase D email send failure and log safety", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const stdoutOutput = () =>
    stdoutSpy.mock.calls
      .map((call: [unknown, ...unknown[]]) => String(call[0]))
      .join("");

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.doMock("@/lib/ports/error-tracker", () => ({
      getErrorTracker: () => ({
        capture: vi.fn(),
      }),
    }));
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    vi.doUnmock("@/lib/email/resend");
    vi.doUnmock("@/lib/ports/error-tracker");
    vi.doUnmock("nodemailer");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("redacts the dev mock recipient log when no email transport is configured", async () => {
    // A shell or CI VERCEL_ENV=production would otherwise turn this into the
    // fail-closed path.
    vi.stubEnv("VERCEL_ENV", "");
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      html: "<p>Safe test body</p>",
      subject: "Phase D OTP test",
      to: "phase-d-recipient@example.test",
    });

    expect(result).toBe(true);
    const output = stdoutOutput();
    expect(output).toContain("[redacted-email]");
    expect(output).not.toContain("phase-d-recipient@example.test");
  });

  it("fails closed in production when no email transport is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      html: "<p>Availability update</p>",
      subject: "Your saved piece is available",
      to: "phase-d-recipient@example.test",
    });

    expect(result).toBe(false);
    const output = stdoutOutput();
    expect(output).toContain("Email transport is not configured in production");
    expect(output).not.toContain("phase-d-recipient@example.test");
  });

  it("fails closed in production when SMTP is only partially configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "mailer@example.test");
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_PASSWORD;
    const createTransport = vi.fn();
    vi.doMock("nodemailer", () => ({ default: { createTransport } }));

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      html: "<p>Availability update</p>",
      subject: "Your saved piece is available",
      to: "phase-d-recipient@example.test",
    });

    expect(result).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
    const output = stdoutOutput();
    expect(output).toContain("Email transport is not configured in production");
    expect(output).not.toContain("phase-d-recipient@example.test");
  });

  it("fails closed on a Vercel production deploy even when NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      html: "<p>Availability update</p>",
      subject: "Your saved piece is available",
      to: "phase-d-recipient@example.test",
    });

    expect(result).toBe(false);
    const output = stdoutOutput();
    expect(output).toContain("Email transport is not configured in production");
    expect(output).not.toContain("Dev mock: email not sent");
    expect(output).not.toContain("phase-d-recipient@example.test");
  });

  it("returns false and redacts provider exception details", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_phase_d_test_key");
    vi.doMock("@/lib/email/resend", () => ({
      FROM_EMAIL: "From the Trunk <hello@fromthetrunk.shop>",
      getResendClient: () => ({
        emails: {
          send: vi.fn().mockRejectedValue(
            new Error("provider rejected phase-d-recipient@example.test token=test-sensitive-value"),
          ),
        },
      }),
    }));

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      html: "<p>Safe test body</p>",
      subject: "Phase D OTP test",
      to: "phase-d-recipient@example.test",
    });

    expect(result).toBe(false);
    const output = stdoutOutput();
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("token=[redacted]");
    expect(output).not.toContain("phase-d-recipient@example.test");
    expect(output).not.toContain("test-sensitive-value");
  });
});
