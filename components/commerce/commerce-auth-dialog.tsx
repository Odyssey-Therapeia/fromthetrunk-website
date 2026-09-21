"use client";

/**
 * The one sign-in surface for commerce, owned by CommerceAuthProvider.
 *
 * Two steps and nothing more: an email, then the six-digit code. No name, no
 * password, no phone, no address — checkout already collects what it needs,
 * and asking here would turn "save this saree" into a registration form. It
 * rides the existing sign_in OTP flow rather than the sign-up wizard.
 */

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";
import type { PendingCommerceIntent } from "@/lib/commerce/auth-intent";

type Step = "identify" | "verify";

const INTENT_COPY: Record<PendingCommerceIntent["type"], string> = {
  "add-to-cart": "to hold this saree in your bag",
  "notify-me": "to tell you when this piece is free",
  "wishlist-toggle": "to keep this saree in your trunk",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CommerceAuthDialog() {
  const auth = useCommerceAuth();
  const isOpen = auth?.isDialogOpen ?? false;

  if (!auth) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) auth.closeDialog();
      }}
    >
      {/*
        The form lives inside DialogContent, which Radix unmounts on close, so
        a half-entered code from a previous attempt can never be sitting in the
        field when the popup next opens. No reset effect needed.
      */}
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto rounded-[1.75rem] border-ftt-border bg-ftt-ivory p-5 sm:max-w-md sm:p-6">
        <CommerceAuthForm />
      </DialogContent>
    </Dialog>
  );
}

function CommerceAuthForm() {
  const auth = useCommerceAuth();
  const { status, update } = useSession();

  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<null | string>(null);
  const [error, setError] = useState<null | string>(null);
  const [pending, setPending] = useState(false);

  if (!auth) return null;

  const intentReason = auth.pendingIntent
    ? INTENT_COPY[auth.pendingIntent.type]
    : "to continue";

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v2/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedEmail, purpose: "sign_in" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        challengeToken?: string;
        maskedEmail?: null | string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.challengeToken) {
        setError(payload?.message ?? "We could not send a code. Please try again.");
        return;
      }

      setChallengeToken(payload.challengeToken);
      setMaskedEmail(payload.maskedEmail ?? trimmedEmail);
      setStep("verify");
    } catch {
      setError("We could not send a code. Please check your connection.");
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v2/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, otp: code }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        ticket?: string;
      } | null;

      if (!response.ok || !payload?.ticket) {
        setError(payload?.message ?? "That code did not work. Please try again.");
        return;
      }

      const result = await signIn("email-otp", {
        loginTicket: payload.ticket,
        redirect: false,
      });
      if (!result || result.error) {
        setError("We could not finish signing you in. Please request a new code.");
        return;
      }

      /*
       * Wait for the session before handing back. The provider replays the
       * pending action on status === "authenticated", and replaying against a
       * session that has not landed would send an unauthenticated request.
       */
      await update();
      auth.onAuthenticated();
    } catch {
      setError("We could not finish signing you in. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="font-serif text-2xl leading-tight text-ftt-navy">
            {step === "identify" ? "Continue with email" : "Enter your code"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-ftt-burgundy/70">
            {step === "identify"
              ? `We just need your email ${intentReason}.`
              : `We sent a six-digit code to ${maskedEmail ?? "your email"}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "identify" ? (
          <form onSubmit={requestCode} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="commerce-auth-email">Email address</Label>
              <Input
                id="commerce-auth-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={pending || status === "loading"}
              className="min-h-11 w-full rounded-full bg-ftt-burgundy text-ftt-ivory hover:bg-ftt-navy"
            >
              {pending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Send verification code
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="commerce-auth-otp">Six-digit code</Label>
              {/*
                Six boxes rather than one field. input-otp handles paste of a
                whole code, arrow keys and backspace across the slots, and
                one-time-code autofill from the mail app.
              */}
              <InputOTP
                id="commerce-auth-otp"
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={pending}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full rounded-full bg-ftt-burgundy text-ftt-ivory hover:bg-ftt-navy"
            >
              {pending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Verify and continue
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("identify");
                setOtp("");
                setError(null);
              }}
              className="w-full text-center text-xs font-semibold text-ftt-burgundy/70 underline-offset-2 hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}
    </>
  );
}
