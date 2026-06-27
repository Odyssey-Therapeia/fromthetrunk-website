"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

import { AccountAuthFrame } from "@/components/account/account-auth-frame";
import { OtpAuthPanel } from "@/components/account/otp-auth-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";

const providerLabels: Record<string, string> = {
  "azure-ad": "Continue with Microsoft",
  google: "Continue with Google",
  twitter: "Continue with X",
};

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const prefilledEmail = searchParams.get("email") ?? "";
  const isPasswordMode = searchParams.get("mode") === "password";
  const [providers, setProviders] = useState<ClientSafeProvider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [passwordEmail, setPasswordEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);

  const resolvedCallbackUrl = buildClientCallbackUrl(
    callbackUrl,
    "/account/profile",
  );

  useEffect(() => {
    let isActive = true;

    const loadProviders = async () => {
      try {
        const availableProviders = await getProviders();
        if (!isActive) return;

        const values = Object.values(availableProviders ?? {}).filter(
          (provider) =>
            provider.id !== "credentials" && provider.id !== "email-otp",
        );
        setProviders(values);
      } finally {
        if (isActive) setIsLoadingProviders(false);
      }
    };

    void loadProviders();

    return () => {
      isActive = false;
    };
  }, []);

  if (isPasswordMode) {
    return (
      <AccountAuthFrame
        mode="sign-in"
        eyebrow="Private access"
        title="Open your trunk."
        body="Enter with your existing password, or return to the OTP flow for customer sign-in."
        alternateHref={
          callbackUrl
            ? `/account/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
            : "/account/sign-up"
        }
      >
        <form
          className="ftt-account-glow-card flex flex-col gap-4 rounded-[1.5rem] border border-ftt-border bg-ftt-ivory p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)]"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!passwordEmail.trim() || !password || isSubmittingCredentials) return;

            setErrorMessage(null);
            setIsSubmittingCredentials(true);

            try {
              const result = await signIn("credentials", {
                redirect: false,
                email: passwordEmail.trim(),
                password,
                callbackUrl: resolvedCallbackUrl,
              });

              if (!result || result.error) {
                setErrorMessage("Invalid email or password.");
                return;
              }

              router.push(resolvedCallbackUrl);
              router.refresh();
            } finally {
              setIsSubmittingCredentials(false);
            }
          }}
        >
          <Button
            type="button"
            variant="ghost"
            className="w-fit rounded-full px-3 text-ftt-burgundy/65 hover:bg-ftt-gold/10 hover:text-ftt-navy"
            onClick={() => {
              const params = new URLSearchParams();
              if (callbackUrl) params.set("callbackUrl", callbackUrl);
              router.push(`/account/sign-in${params.size ? `?${params}` : ""}`);
            }}
          >
            <ArrowLeft data-icon="inline-start" />
            Use OTP instead
          </Button>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="passwordEmail"
              className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65"
            >
              Email address
            </Label>
            <Input
              id="passwordEmail"
              type="email"
              value={passwordEmail}
              onChange={(event) => setPasswordEmail(event.target.value)}
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
                autoComplete="current-password"
                className="h-12 rounded-xl border-ftt-border bg-ftt-card pr-11 text-ftt-navy focus-visible:ring-ftt-gold/35"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ftt-burgundy/55 transition hover:bg-ftt-gold/10 hover:text-ftt-burgundy"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-xl border border-ftt-burgundy/20 bg-ftt-burgundy/10 px-3 py-2 text-sm text-ftt-burgundy">
              {errorMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
            disabled={isSubmittingCredentials}
          >
            {isSubmittingCredentials ? "Opening your trunk..." : "Sign in"}
          </Button>
        </form>
      </AccountAuthFrame>
    );
  }

  return (
    <AccountAuthFrame
      mode="sign-in"
      eyebrow="Private access"
      title="Open your trunk."
      body="Enter your email or registered mobile number. If you use a mobile number, we’ll send the OTP to the email linked to that account."
      alternateHref={
        callbackUrl
          ? `/account/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
          : "/account/sign-up"
      }
    >
      <OtpAuthPanel
        mode="sign-in"
        context="account"
        callbackUrl={callbackUrl ?? undefined}
        initialIdentifier={prefilledEmail}
      />

      {providers.length > 0 ? (
        <section className="mt-5 rounded-[1.25rem] border border-ftt-border bg-ftt-card/80 p-4">
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/50">
            Other ways to continue
          </p>
          <div className="flex flex-col gap-3">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full border-ftt-gold/35 bg-ftt-card text-ftt-burgundy hover:bg-ftt-gold/10"
                onClick={() => signIn(provider.id, { callbackUrl: resolvedCallbackUrl })}
              >
                {providerLabels[provider.id] ?? `Continue with ${provider.name}`}
              </Button>
            ))}
          </div>
        </section>
      ) : isLoadingProviders ? (
        <p className="mt-4 text-center text-sm text-ftt-burgundy/50">
          Loading other sign-in options...
        </p>
      ) : null}
    </AccountAuthFrame>
  );
}
