"use client";

import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import { OtpAuthPanel } from "@/components/account/otp-auth-panel";
import { cn } from "@/lib/utils";

type CheckoutAuthGateProps = {
  isCheckingSession?: boolean;
  onSuccess: () => Promise<void> | void;
};

export function CheckoutAuthGate({
  isCheckingSession,
  onSuccess,
}: CheckoutAuthGateProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  return (
    <section className="rounded-[2rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_18px_56px_rgba(20,29,70,0.1)] sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="rounded-[1.5rem] border border-ftt-gold/25 bg-ftt-ivory p-5">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-ftt-navy text-ftt-gold">
              <LockKeyhole className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-gold">
                Secure checkout
              </p>
              <h1 className="mt-2 font-serif text-3xl leading-tight text-ftt-navy sm:text-4xl">
                Open your trunk to continue checkout.
              </h1>
              <p className="mt-3 text-sm leading-6 text-ftt-burgundy/68">
                Sign in or create an account so we can save your address, order,
                and selected pieces.
              </p>
            </div>
          </div>
        </div>

        {isCheckingSession ? (
          <div className="rounded-[1.5rem] border border-ftt-border bg-ftt-ivory p-6 text-sm text-ftt-burgundy/60">
            Checking your account session...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-full border border-ftt-border bg-ftt-ivory p-1">
              {(["sign-in", "sign-up"] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => setMode(nextMode)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === nextMode
                      ? "bg-ftt-navy text-ftt-ivory shadow-[0_8px_18px_rgba(20,29,70,0.16)]"
                      : "text-ftt-burgundy/65 hover:bg-ftt-gold/10 hover:text-ftt-navy",
                  )}
                >
                  {nextMode === "sign-in" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <OtpAuthPanel
              key={mode}
              mode={mode}
              context="checkout"
              callbackUrl="/checkout"
              compact
              requireAddress={false}
              onSuccess={onSuccess}
            />
          </>
        )}

        <div className="flex items-start gap-3 rounded-[1.25rem] border border-ftt-gold/20 bg-ftt-gold/8 p-4 text-sm leading-6 text-ftt-burgundy/68">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ftt-gold" aria-hidden />
          Your cart stays here while you sign in. We will not create a payment
          order until your account is ready.
        </div>
      </div>
    </section>
  );
}
