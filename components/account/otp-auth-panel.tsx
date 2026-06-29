"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";

import { OtpCodeInput } from "@/components/account/otp-code-input";
import { OtpResendButton } from "@/components/account/otp-resend-button";
import { OtpStepper } from "@/components/account/otp-stepper";
import { SignupAddressStep } from "@/components/account/signup-address-step";
import { PhoneField } from "@/components/checkout/phone-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";
import {
  composeAddressLine2,
  emptyAddress,
  hasErrors,
  type AddressFieldErrors,
  type AddressForm,
  validateAddressForm,
} from "@/lib/checkout/address-form";
import { DEFAULT_COUNTRY_CODE } from "@/lib/checkout/locations";
import { cn } from "@/lib/utils";

type OtpAuthMode = "sign-in" | "sign-up";
type OtpAuthContext = "account" | "wishlist" | "checkout";
type SignInStep = "identifier" | "verify";
type SignUpStep = "email" | "verify" | "details" | "address";

type StartOtpResponse = {
  ok?: boolean;
  challengeToken?: string;
  expiresAt?: string;
  maskedEmail?: null | string;
  message?: string;
  resendAvailableAt?: string;
};

type VerifyOtpResponse = {
  message?: string;
  mode?: "sign_in" | "sign_up";
  ok?: boolean;
  ticket?: string;
};

type CompleteRegistrationResponse = {
  ok?: boolean;
  loginTicket?: string;
};

type OtpAuthPanelProps = {
  mode: OtpAuthMode;
  context: OtpAuthContext;
  callbackUrl?: string;
  onSuccess?: () => Promise<void> | void;
  onCancel?: () => void;
  compact?: boolean;
  requireAddress?: boolean;
  initialIdentifier?: string;
};

type SignUpOtpPanelProps = Omit<
  OtpAuthPanelProps,
  "initialIdentifier" | "mode"
> & {
  initialEmail: string;
};

const genericSentMessage =
  "If this email or account can continue, we’ve sent a code.";
const signUpSentMessage = "Code sent to your email.";
const signUpStepsWithAddress = ["Email", "Verify", "Details", "Address"];
const signUpStepsWithoutAddress = ["Email", "Verify", "Details"];
const fieldClass =
  "h-12 rounded-xl border-ftt-border bg-ftt-card text-ftt-navy focus-visible:ring-ftt-gold/35";

const readJson = async <T,>(response: Response): Promise<T | null> =>
  response.json().catch(() => null);

const otpSentMessage = (maskedEmail?: null | string) =>
  maskedEmail
    ? `We sent the OTP to ${maskedEmail}.`
    : genericSentMessage;

const codeSentMessage = (maskedEmail?: null | string) =>
  maskedEmail ? `Code sent to ${maskedEmail}.` : signUpSentMessage;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function OtpAuthPanel({
  mode,
  context,
  callbackUrl,
  onSuccess,
  onCancel,
  compact,
  requireAddress = mode === "sign-up" && context === "account",
  initialIdentifier = "",
}: OtpAuthPanelProps) {
  return mode === "sign-up" ? (
    <SignUpOtpPanel
      context={context}
      callbackUrl={callbackUrl}
      onSuccess={onSuccess}
      onCancel={onCancel}
      compact={compact}
      requireAddress={requireAddress}
      initialEmail={initialIdentifier}
    />
  ) : (
    <SignInOtpPanel
      context={context}
      callbackUrl={callbackUrl}
      onSuccess={onSuccess}
      onCancel={onCancel}
      compact={compact}
      initialIdentifier={initialIdentifier}
    />
  );
}

function SignInOtpPanel({
  context,
  callbackUrl,
  onSuccess,
  onCancel,
  compact,
  initialIdentifier,
}: Omit<OtpAuthPanelProps, "mode" | "requireAddress">) {
  const router = useRouter();
  const { update } = useSession();
  const [identifier, setIdentifier] = useState(initialIdentifier ?? "");
  const [step, setStep] = useState<SignInStep>("identifier");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<null | string>(null);
  const [otp, setOtp] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const identifierRef = useRef<HTMLInputElement | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);
  const submittedOtpRef = useRef("");
  const resolvedCallbackUrl = buildClientCallbackUrl(
    callbackUrl,
    context === "checkout" ? "/checkout" : "/account/profile",
  );
  const isAccountContext = context === "account";

  useEffect(() => {
    if (step !== "verify") return;
    const focusTimer = window.setTimeout(() => otpRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [challengeToken, step]);

  const requestOtp = async ({ resend = false }: { resend?: boolean } = {}) => {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setErrorMessage("Enter your email or registered mobile number.");
      identifierRef.current?.focus();
      return;
    }
    if (normalizedIdentifier.length < 3) {
      setErrorMessage("Enter a valid email or registered mobile number.");
      identifierRef.current?.focus();
      return;
    }
    if (isStarting || isResending) return;

    setErrorMessage(null);
    if (resend) setIsResending(true);
    else setIsStarting(true);

    try {
      const response = await fetch("/api/v2/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          purpose: "sign_in",
        }),
      });
      const data = await readJson<StartOtpResponse>(response);

      if (!response.ok || !data?.challengeToken) {
        setErrorMessage("Unable to send a code right now. Please try again.");
        return;
      }

      setChallengeToken(data.challengeToken);
      setResendAvailableAt(data.resendAvailableAt ?? null);
      setOtp("");
      submittedOtpRef.current = "";
      setStep("verify");
      setStatusMessage(otpSentMessage(data.maskedEmail));
      window.setTimeout(() => otpRef.current?.focus(), 80);
    } finally {
      setIsStarting(false);
      setIsResending(false);
    }
  };

  const finishSignIn = async (loginTicket: string) => {
    const result = await signIn("email-otp", {
      callbackUrl: resolvedCallbackUrl,
      loginTicket,
      redirect: false,
    });

    if (!result || result.error) {
      setErrorMessage("We could not finish signing you in. Please request a new code.");
      return;
    }

    await update();
    router.refresh();
    await onSuccess?.();

    if (isAccountContext) {
      router.push(resolvedCallbackUrl);
    }
  };

  const verifyOtp = async (code = otp) => {
    if (!challengeToken || code.length !== 6 || isVerifying) return;

    setErrorMessage(null);
    setIsVerifying(true);

    try {
      const response = await fetch("/api/v2/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          otp: code,
        }),
      });
      const data = await readJson<VerifyOtpResponse>(response);

	      if (!response.ok || !data?.ticket) {
	        setErrorMessage(data?.message ?? "That code did not work. Check the digits and try again.");
	        window.setTimeout(() => otpRef.current?.focus(), 80);
	        return;
      }

      await finishSignIn(data.ticket);
    } finally {
      setIsVerifying(false);
    }
  };

  const submitOtpOnce = (code: string) => {
    if (
      step === "verify" &&
      code.length === 6 &&
      !isVerifying &&
      submittedOtpRef.current !== code
    ) {
      submittedOtpRef.current = code;
      void verifyOtp(code);
    }
  };

  const handleOtpChange = (next: string) => {
    setOtp(next);
    setErrorMessage(null);
    if (next.length < 6) submittedOtpRef.current = "";
    submitOtpOnce(next);
  };

  return (
    <div
      className={cn(
        "ftt-account-glow-card rounded-[1.5rem] border border-ftt-border bg-ftt-ivory shadow-[0_16px_42px_rgba(20,29,70,0.08)]",
        compact ? "p-4" : "p-5",
      )}
    >
      <PanelHeader label="OTP access" />

      {step === "identifier" ? (
        <form
          className="flex animate-in flex-col gap-4 fade-in-0 slide-in-from-right-2 duration-300"
          onSubmit={(event) => {
            event.preventDefault();
            void requestOtp();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="identifier"
              className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
            >
              Email or registered mobile number
            </Label>
            <Input
              ref={identifierRef}
              id="identifier"
              type="text"
              inputMode="email"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setErrorMessage(null);
              }}
              required
              autoComplete="username"
              className={fieldClass}
            />
            <p className="text-xs leading-5 text-ftt-burgundy/55">
              Email sign-in sends the OTP to that email. Mobile number sign-in sends the OTP to the email linked to that account.
            </p>
          </div>

          <ErrorMessage message={errorMessage} />

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
            disabled={isStarting}
          >
            {isStarting ? "Sending OTP..." : "Send OTP"}
          </Button>

          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full text-ftt-burgundy/65 hover:bg-ftt-gold/10 hover:text-ftt-navy"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
        </form>
      ) : (
        <form
          className="flex animate-in flex-col gap-4 fade-in-0 slide-in-from-right-2 duration-300"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyOtp();
          }}
        >
          <button
            type="button"
            className="flex w-fit items-center gap-2 text-sm font-medium text-ftt-burgundy/65 transition hover:text-ftt-navy"
            onClick={() => {
              setStep("identifier");
              setOtp("");
              setErrorMessage(null);
              submittedOtpRef.current = "";
            }}
          >
            <ArrowLeft aria-hidden />
            Edit identifier
          </button>

          <SentNotice message={statusMessage ?? genericSentMessage} />

          <div className="flex flex-col gap-3">
            <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
              Verification code
            </Label>
            <OtpCodeInput
              inputRef={otpRef}
              value={otp}
              onChange={handleOtpChange}
              onComplete={submitOtpOnce}
              disabled={isVerifying}
              invalid={Boolean(errorMessage)}
            />
          </div>

          <InlineStatus error={errorMessage} />

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
            disabled={isVerifying || otp.length !== 6}
          >
            {isVerifying ? "Verifying..." : "Verify and sign in"}
          </Button>

          <div className="flex justify-center">
            <OtpResendButton
              resendAvailableAt={resendAvailableAt}
              isResending={isResending}
              disabled={isVerifying}
              onResend={() => void requestOtp({ resend: true })}
            />
          </div>
        </form>
      )}
    </div>
  );
}

function SignUpOtpPanel({
  context,
  callbackUrl,
  onSuccess,
  onCancel,
  compact,
  requireAddress,
  initialEmail,
}: SignUpOtpPanelProps) {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState<SignUpStep>("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<null | string>(null);
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] =
    useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [addressLabel, setAddressLabel] = useState("Home");
  const [address, setAddress] = useState<AddressForm>(() => emptyAddress());
  const [addressErrors, setAddressErrors] = useState<AddressFieldErrors>({});
  const [detailsErrors, setDetailsErrors] = useState<{
    fullName?: string;
    phone?: string;
  }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const fullNameRef = useRef<HTMLInputElement | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);
  const submittedOtpRef = useRef("");
  const steps = requireAddress ? signUpStepsWithAddress : signUpStepsWithoutAddress;
  const stepIds: SignUpStep[] = requireAddress
    ? ["email", "verify", "details", "address"]
    : ["email", "verify", "details"];
  const currentStepIndex = Math.max(0, stepIds.indexOf(step));
  const resolvedCallbackUrl = buildClientCallbackUrl(
    callbackUrl,
    context === "checkout" ? "/checkout" : "/account/profile",
  );
  const isAccountContext = context === "account";

  useEffect(() => {
    if (step !== "verify") return;
    const focusTimer = window.setTimeout(() => otpRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [challengeToken, step]);

  const requestOtp = async ({ resend = false }: { resend?: boolean } = {}) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    if (!isEmail(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    if (isStarting || isResending) return;

    setErrorMessage(null);
    if (resend) setIsResending(true);
    else setIsStarting(true);

    try {
      const response = await fetch("/api/v2/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: normalizedEmail,
          purpose: "sign_up",
        }),
      });
      const data = await readJson<StartOtpResponse>(response);

      if (!response.ok || !data?.challengeToken) {
        setErrorMessage("Unable to send a code right now. Please try again.");
        return;
      }

      setEmail(normalizedEmail);
      setChallengeToken(data.challengeToken);
      setResendAvailableAt(data.resendAvailableAt ?? null);
      setOtp("");
      submittedOtpRef.current = "";
      setStep("verify");
      setStatusMessage(codeSentMessage(data.maskedEmail));
      window.setTimeout(() => otpRef.current?.focus(), 80);
    } finally {
      setIsStarting(false);
      setIsResending(false);
    }
  };

  const verifyOtp = async (code = otp) => {
    if (!challengeToken || code.length !== 6 || isVerifying) return;

    setErrorMessage(null);
    setIsVerifying(true);

    try {
      const response = await fetch("/api/v2/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          otp: code,
        }),
      });
      const data = await readJson<VerifyOtpResponse>(response);

	      if (!response.ok || !data?.ticket) {
	        setErrorMessage(data?.message ?? "That code did not work. Check the digits and try again.");
	        window.setTimeout(() => otpRef.current?.focus(), 80);
	        return;
      }

      setRegistrationToken(data.ticket);
      setStep("details");
      setStatusMessage("Email verified. Add your details to finish.");
      setErrorMessage(null);
      window.setTimeout(() => fullNameRef.current?.focus(), 80);
    } finally {
      setIsVerifying(false);
    }
  };

  const validateDetails = () => {
    const nextErrors: { fullName?: string; phone?: string } = {};

    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!phone.trim()) nextErrors.phone = "Mobile number is required.";
    else if (!isValidPhoneNumber(phone))
      nextErrors.phone = "Enter a valid mobile number.";

    setDetailsErrors(nextErrors);

    if (nextErrors.fullName) fullNameRef.current?.focus();
    else if (nextErrors.phone) {
      document
        .querySelector<HTMLInputElement>('input[autocomplete="tel-national"]')
        ?.focus();
    }

    return Object.keys(nextErrors).length === 0;
  };

  const continueToAddress = () => {
    if (!validateDetails()) return;

    setAddress((previous) => ({
      ...previous,
      email,
      fullName: previous.fullName.trim() ? previous.fullName : fullName,
      phone: previous.phone.trim() ? previous.phone : phone,
      phoneCountry,
    }));
    setStep("address");
    setErrorMessage(null);
    setStatusMessage("Add your first delivery address so checkout feels effortless.");
  };

  const completeRegistration = async () => {
    if (!registrationToken || isCompleting) return;
    if (!validateDetails()) return;

    const body: {
      address?: {
        city: string;
        country: string;
        isDefault: boolean;
        label: string;
        line1: string;
        line2: string;
        name: string;
        phone: string;
        postalCode: string;
        state: string;
      };
      fullName: string;
      phone: string;
      phoneCountry: CountryCode;
      registrationToken: string;
    } = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      phoneCountry,
      registrationToken,
    };

    if (requireAddress) {
      const normalizedAddress: AddressForm = {
        ...address,
        email,
        fullName: address.fullName.trim() || fullName.trim(),
        phone: address.phone.trim() || phone.trim(),
        phoneCountry: address.phoneCountry || phoneCountry,
      };
      const nextAddressErrors = validateAddressForm(normalizedAddress);
      setAddressErrors(nextAddressErrors);

      if (hasErrors(nextAddressErrors)) {
        setErrorMessage("Check the highlighted address fields and try again.");
        window.setTimeout(() => {
          document
            .querySelector<HTMLInputElement>('input[autocomplete="address-line1"]')
            ?.focus();
        }, 80);
        return;
      }

      body.address = {
        city: normalizedAddress.city.trim(),
        country: normalizedAddress.country.trim(),
        isDefault: true,
        label: addressLabel,
        line1: normalizedAddress.line1.trim(),
        line2: composeAddressLine2(normalizedAddress),
        name: normalizedAddress.fullName.trim(),
        phone: normalizedAddress.phone.trim(),
        postalCode: normalizedAddress.postalCode.trim(),
        state: normalizedAddress.state.trim(),
      };
    }

    setErrorMessage(null);
    setIsCompleting(true);

    try {
      const response = await fetch("/api/v2/auth/otp/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson<CompleteRegistrationResponse>(response);

      if (!response.ok || !data?.loginTicket) {
        setErrorMessage("Unable to create your account right now. Please try again.");
        return;
      }

      const result = await signIn("email-otp", {
        callbackUrl: resolvedCallbackUrl,
        loginTicket: data.loginTicket,
        redirect: false,
      });

      if (!result || result.error) {
        setErrorMessage("Your account was created, but sign-in could not finish.");
        return;
      }

      await update();
      router.refresh();
      await onSuccess?.();

      if (isAccountContext) {
        router.push(resolvedCallbackUrl);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const submitOtpOnce = (code: string) => {
    if (
      step === "verify" &&
      code.length === 6 &&
      !isVerifying &&
      submittedOtpRef.current !== code
    ) {
      submittedOtpRef.current = code;
      void verifyOtp(code);
    }
  };

  const handleOtpChange = (next: string) => {
    setOtp(next);
    setErrorMessage(null);
    if (next.length < 6) submittedOtpRef.current = "";
    submitOtpOnce(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <OtpStepper steps={steps} currentStep={currentStepIndex} />

      <div
        className={cn(
          "ftt-account-glow-card rounded-[1.5rem] border border-ftt-border bg-ftt-ivory shadow-[0_16px_42px_rgba(20,29,70,0.08)]",
          compact ? "p-4" : "p-5",
        )}
      >
        <PanelHeader label="OTP registration" />

        {step === "email" ? (
          <form
            className="flex animate-in flex-col gap-4 fade-in-0 slide-in-from-right-2 duration-300"
            onSubmit={(event) => {
              event.preventDefault();
              void requestOtp();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="signupEmail"
                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
              >
                Email address
              </Label>
              <Input
                ref={emailRef}
                id="signupEmail"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
                required
                autoComplete="email"
                className={fieldClass}
              />
            </div>

            <ErrorMessage message={errorMessage} />

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
              disabled={isStarting}
            >
              {isStarting ? "Sending OTP..." : "Send OTP"}
            </Button>

            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-full text-ftt-burgundy/65 hover:bg-ftt-gold/10 hover:text-ftt-navy"
                onClick={onCancel}
              >
                Cancel
              </Button>
            ) : null}
          </form>
        ) : null}

        {step === "verify" ? (
          <form
            className="flex animate-in flex-col gap-4 fade-in-0 slide-in-from-right-2 duration-300"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
          >
            <button
              type="button"
              className="flex w-fit items-center gap-2 text-sm font-medium text-ftt-burgundy/65 transition hover:text-ftt-navy"
              onClick={() => {
                setStep("email");
                setOtp("");
                setErrorMessage(null);
                submittedOtpRef.current = "";
              }}
            >
              <ArrowLeft aria-hidden />
              Edit email
            </button>

            <SentNotice message={statusMessage ?? signUpSentMessage} />

            <div className="flex flex-col gap-3">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
                Verification code
              </Label>
              <OtpCodeInput
                inputRef={otpRef}
                value={otp}
                onChange={handleOtpChange}
                onComplete={submitOtpOnce}
                disabled={isVerifying}
                invalid={Boolean(errorMessage)}
              />
            </div>

            <InlineStatus error={errorMessage} />

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
              disabled={isVerifying || otp.length !== 6}
            >
              {isVerifying ? "Verifying..." : "Verify email"}
            </Button>

            <div className="flex justify-center">
              <OtpResendButton
                resendAvailableAt={resendAvailableAt}
                isResending={isResending}
                disabled={isVerifying}
                onResend={() => void requestOtp({ resend: true })}
              />
            </div>
          </form>
        ) : null}

        {step === "details" ? (
          <form
            className="flex animate-in flex-col gap-4 fade-in-0 slide-in-from-right-2 duration-300"
            onSubmit={(event) => {
              event.preventDefault();
              if (requireAddress) continueToAddress();
              else void completeRegistration();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="fullName"
                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
              >
                Full name
              </Label>
              <Input
                ref={fullNameRef}
                id="fullName"
                type="text"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  setDetailsErrors((previous) => ({
                    ...previous,
                    fullName: undefined,
                  }));
                }}
                required
                autoComplete="name"
                aria-invalid={Boolean(detailsErrors.fullName)}
                className={fieldClass}
              />
              {detailsErrors.fullName ? (
                <span className="text-xs text-ftt-burgundy">
                  {detailsErrors.fullName}
                </span>
              ) : null}
            </div>

            <PhoneField
              label="Mobile number with country code"
              value={phone}
              country={phoneCountry}
              onValueChange={(nextPhone) => {
                setPhone(nextPhone);
                setDetailsErrors((previous) => ({ ...previous, phone: undefined }));
              }}
              onCountryChange={setPhoneCountry}
              error={detailsErrors.phone}
            />

            <InlineStatus error={errorMessage} message={statusMessage} />

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
              disabled={isCompleting}
            >
              {isCompleting
                ? "Creating account..."
                : requireAddress
                  ? "Continue to address"
                  : "Create account"}
            </Button>
          </form>
        ) : null}

        {step === "address" ? (
          <form
            className="flex animate-in flex-col gap-5 fade-in-0 slide-in-from-right-2 duration-300"
            onSubmit={(event) => {
              event.preventDefault();
              void completeRegistration();
            }}
          >
            <button
              type="button"
              className="flex w-fit items-center gap-2 text-sm font-medium text-ftt-burgundy/65 transition hover:text-ftt-navy"
              onClick={() => {
                setStep("details");
                setErrorMessage(null);
              }}
            >
              <ArrowLeft aria-hidden />
              Edit details
            </button>

            <SignupAddressStep
              value={address}
              label={addressLabel}
              errors={addressErrors}
              disabled={isCompleting}
              onChange={(next) => {
                setAddress(next);
                setAddressErrors({});
              }}
              onLabelChange={setAddressLabel}
            />

            <InlineStatus error={errorMessage} message={statusMessage} />

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
              disabled={isCompleting}
            >
              {isCompleting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PanelHeader({ label }: { label: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-ftt-gold">
        {label}
      </Badge>
      <ShieldCheck className="text-ftt-gold" aria-hidden />
    </div>
  );
}

function SentNotice({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      className="rounded-2xl border border-ftt-gold/25 bg-ftt-gold/8 p-4"
    >
      <MailCheck className="text-ftt-gold" aria-hidden />
      <p className="mt-2 text-sm leading-6 text-ftt-burgundy/68">{message}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: null | string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-xl border border-ftt-burgundy/20 bg-ftt-burgundy/10 px-3 py-2 text-sm text-ftt-burgundy"
    >
      {message}
    </p>
  );
}

function InlineStatus({
  error,
  message,
}: {
  error?: null | string;
  message?: null | string;
}) {
  return (
    <div aria-live="polite" className="min-h-6 text-sm leading-6">
      {error ? (
        <p role="alert" className="text-ftt-burgundy">
          {error}
        </p>
      ) : message ? (
        <p className="text-ftt-burgundy/62">{message}</p>
      ) : null}
    </div>
  );
}
