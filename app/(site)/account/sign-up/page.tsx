"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

import { AccountAuthFrame } from "@/components/account/account-auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const resolvedCallbackUrl = buildClientCallbackUrl(
    callbackUrl,
    "/account/profile",
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <AccountAuthFrame
      mode="sign-up"
      eyebrow="Create account"
      title="Join the trunk."
      body="Create your account to save favourites, track orders, and checkout faster."
      alternateHref={
        callbackUrl
          ? `/account/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
          : "/account/sign-in"
      }
    >
      <form
        className="ftt-account-glow-card flex flex-col gap-4 rounded-[1.5rem] border border-ftt-border bg-ftt-ivory p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)]"
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSubmitting) return;

          setErrorMessage(null);

          if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
          }

          setIsSubmitting(true);

          try {
            const response = await fetch("/api/v2/users/sign-up", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                email: email.trim(),
                password,
              }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
              setErrorMessage(
                data?.message ||
                  "Unable to create your account. Please try again.",
              );
              return;
            }

            const result = await signIn("credentials", {
              redirect: false,
              email: email.trim(),
              password,
              callbackUrl: resolvedCallbackUrl,
            });

            if (!result || result.error) {
              const signInParams = new URLSearchParams({
                email: email.trim(),
              });
              if (callbackUrl) signInParams.set("callbackUrl", callbackUrl);
              router.push(`/account/sign-in?${signInParams.toString()}`);
              return;
            }

            router.push(resolvedCallbackUrl);
            router.refresh();
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="name"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
          >
            Full name
          </Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className="h-12 rounded-xl border-ftt-border bg-ftt-card text-ftt-navy focus-visible:ring-ftt-gold/35"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="email"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
          >
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-12 rounded-xl border-ftt-border bg-ftt-card text-ftt-navy focus-visible:ring-ftt-gold/35"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="password"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
          >
            Password
          </Label>

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="h-12 rounded-xl border-ftt-border bg-ftt-card pr-11 text-ftt-navy focus-visible:ring-ftt-gold/35"
            />

            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ftt-burgundy/55 transition hover:bg-ftt-gold/10 hover:text-ftt-burgundy"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          <p className="text-xs leading-5 text-ftt-burgundy/50">
            Minimum 8 characters, with uppercase, lowercase, and a number.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="confirmPassword"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
          >
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
            className="h-12 rounded-xl border-ftt-border bg-ftt-card text-ftt-navy focus-visible:ring-ftt-gold/35"
          />
        </div>

        {errorMessage ? (
          <p className="rounded-xl border border-ftt-burgundy/20 bg-ftt-burgundy/10 px-3 py-2 text-sm text-ftt-burgundy">
            {errorMessage}
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating your trunk..." : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ftt-burgundy/60">
        Already have an account?{" "}
        <Link
          href={
            callbackUrl
              ? `/account/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
              : "/account/sign-in"
          }
          className="font-semibold text-ftt-burgundy underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AccountAuthFrame>
  );
}
