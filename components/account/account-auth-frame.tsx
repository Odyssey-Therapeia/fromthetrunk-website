import type { ReactNode } from "react";
import Link from "next/link";
import { Heart, MapPin, Package, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function AccountAuthFrame({
  eyebrow,
  title,
  body,
  children,
  mode,
  alternateHref,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  mode: "sign-in" | "sign-up";
  alternateHref?: string;
}) {
  const fallbackAlternateHref =
    mode === "sign-in" ? "/account/sign-up" : "/account/sign-in";
  const alternateLabel =
    mode === "sign-in" ? "Create account" : "Sign in";

  return (
    <section className="bg-ftt-ivory px-3 py-5 sm:px-6 sm:py-8 lg:py-12">
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[1.5rem] border border-ftt-border bg-ftt-card shadow-[0_24px_80px_rgba(20,29,70,0.13)] sm:rounded-[2rem] xl:min-h-[680px] xl:grid-cols-[70fr_30fr]">
        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
          <div className="ftt-account-reveal w-full max-w-xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.38em] text-ftt-gold">
              {eyebrow}
            </p>

            <h1 className="mt-4 text-center font-serif text-[clamp(2.1rem,12vw,4.6rem)] leading-[0.96] text-ftt-navy sm:text-[clamp(2.35rem,5vw,4.6rem)]">
              {title}
            </h1>

            <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-6 text-ftt-burgundy/62">
              {body}
            </p>

            <div className="mt-6 sm:mt-8">{children}</div>
          </div>
        </div>

        <div className="relative hidden min-h-[420px] overflow-hidden bg-ftt-navy p-6 text-ftt-ivory sm:p-8 lg:min-h-full lg:p-10 xl:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(179,145,82,0.22),transparent_24%),linear-gradient(135deg,#141D46_0%,#10183B_58%,#601D1C_155%)]" />
          <div className="absolute inset-6 rounded-[1.5rem] border border-ftt-gold/18" />
          <div className="absolute -right-16 -top-16 size-64 rounded-full border border-ftt-gold/18" />
          <div className="absolute bottom-10 right-10 size-24 rounded-full bg-ftt-gold/12 blur-2xl" />

          <div className="relative flex h-full min-h-[360px] flex-col justify-between gap-10">
            <div className="flex items-center justify-between">
              <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-ivory/10 px-4 py-2 text-[10px] uppercase tracking-[0.24em] text-ftt-gold backdrop-blur">
                From the Trunk
              </Badge>

              <div className="grid size-12 place-items-center rounded-full border border-ftt-gold/35 bg-ftt-ivory/10 text-ftt-gold">
                <ShieldCheck className="size-5" />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
                Private trunk access
              </p>

              <h2 className="mt-4 max-w-xl font-serif text-[clamp(3rem,6vw,6.4rem)] leading-[0.9]">
                Heritage, saved for your next visit.
              </h2>

              <p className="mt-5 max-w-md text-sm leading-7 text-ftt-ivory/70">
                Your account keeps your saved pieces, delivery locations, and
                order history together, so checkout feels considered.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <AuthBenefit
                icon={<Heart className="size-4" />}
                title="Wishlist"
                body="Save rare pieces"
              />
              <AuthBenefit
                icon={<MapPin className="size-4" />}
                title="Addresses"
                body="Checkout faster"
              />
              <AuthBenefit
                icon={<Package className="size-4" />}
                title="Orders"
                body="Track your trunk"
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-ftt-burgundy/45">
        {mode === "sign-in"
          ? "New here? Create an account to save your wishlist and checkout faster."
          : "Already part of the trunk? Sign in to continue where you left off."}{" "}
        <Link
          href={alternateHref ?? fallbackAlternateHref}
          className="font-semibold text-ftt-burgundy underline underline-offset-4"
        >
          {alternateLabel}
        </Link>
      </p>
    </section>
  );
}

function AuthBenefit({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur">
      <div className="text-ftt-gold">{icon}</div>
      <p className="mt-3 text-sm font-semibold text-ftt-ivory">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ftt-ivory/55">{body}</p>
    </div>
  );
}
