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
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("redacts the dev mock recipient log when no email transport is configured", async () => {
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
