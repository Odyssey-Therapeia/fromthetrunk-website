"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

import { AccountAuthFrame } from "@/components/account/account-auth-frame";
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
  const [providers, setProviders] = useState<ClientSafeProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

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
          (provider) => provider.id !== "credentials",
        );
        setProviders(values);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadProviders();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <AccountAuthFrame
      mode="sign-in"
      eyebrow="Open your trunk"
      title="Welcome back."
      body="Sign in to manage your saved pieces, addresses, orders, and checkout details."
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
          if (!email.trim() || !password || isSubmittingCredentials) return;

          setCredentialsError(null);
          setIsSubmittingCredentials(true);

          try {
            const result = await signIn("credentials", {
              redirect: false,
              email: email.trim(),
              password,
              callbackUrl: resolvedCallbackUrl,
            });

            if (!result || result.error) {
              setCredentialsError("Invalid email or password.");
              return;
            }

            router.push(resolvedCallbackUrl);
            router.refresh();
          } finally {
            setIsSubmittingCredentials(false);
          }
        }}
      >
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
              autoComplete="current-password"
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
        </div>

        {credentialsError ? (
          <p className="rounded-xl border border-ftt-burgundy/20 bg-ftt-burgundy/10 px-3 py-2 text-sm text-ftt-burgundy">
            {credentialsError}
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
          disabled={isSubmittingCredentials}
        >
          {isSubmittingCredentials ? "Opening your trunk..." : "Sign in"}
        </Button>

        <p className="text-center text-sm text-ftt-burgundy/60">
          New to From the Trunk?{" "}
          <Link
            href={
              callbackUrl
                ? `/account/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
                : "/account/sign-up"
            }
            className="font-semibold text-ftt-burgundy underline underline-offset-4"
          >
            Create your account
          </Link>
        </p>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {isLoading ? (
          <p className="text-center text-sm text-ftt-burgundy/50">
            Loading sign-in options...
          </p>
        ) : null}

        {!isLoading && providers.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-ftt-border bg-ftt-ivory px-5 py-4 text-sm leading-6 text-ftt-burgundy/55">
            No social sign-in providers are configured in this environment yet.
          </div>
        ) : null}

        {providers.map((provider) => (
          <Button
            key={provider.id}
            variant="outline"
            className="h-11 w-full rounded-full border-ftt-gold/35 bg-ftt-card text-ftt-burgundy hover:bg-ftt-gold/10"
            onClick={() =>
              signIn(provider.id, { callbackUrl: resolvedCallbackUrl })
            }
          >
            {providerLabels[provider.id] ?? `Continue with ${provider.name}`}
          </Button>
        ))}
      </div>
    </AccountAuthFrame>
  );
}
