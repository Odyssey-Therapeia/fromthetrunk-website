import Link from "next/link";
import { ChevronLeft, LockKeyhole, PackageCheck, ShieldCheck } from "lucide-react";

export function CheckoutShell() {
  return (
    <>
      <Link
        href="/cart"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-ftt-burgundy transition hover:text-ftt-burgundy"
      >
        <ChevronLeft className="size-4" />
        Back to cart
      </Link>

      <section className="mt-6 overflow-hidden rounded-3xl border border-ftt-border bg-ftt-card shadow-[var(--ftt-soft-shadow)] lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="bg-[linear-gradient(135deg,#141D46_0%,#10183B_62%,#601D1C_150%)] p-6 text-ftt-ivory sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
            Secure checkout
          </p>
          <h1 className="mt-4 max-w-2xl font-serif text-[clamp(2.85rem,7vw,5.8rem)] leading-[0.92] text-ftt-ivory">
            Complete your trunk.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-ftt-ivory/72 sm:text-base">
            Sign in, choose your delivery details, and review your selected
            piece before Razorpay opens.
          </p>
        </div>

        <div className="grid gap-3 border-t border-ftt-border bg-ftt-ivory p-5 lg:border-l lg:border-t-0">
          <CheckoutPromise icon={<ShieldCheck className="h-4 w-4" />}>
            Server-verified totals
          </CheckoutPromise>
          <CheckoutPromise icon={<LockKeyhole className="h-4 w-4" />}>
            Protected payment
          </CheckoutPromise>
          <CheckoutPromise icon={<PackageCheck className="h-4 w-4" />}>
            Careful packing
          </CheckoutPromise>
        </div>
      </section>
    </>
  );
}

function CheckoutPromise({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ftt-border bg-ftt-card px-4 py-3 text-sm font-medium text-ftt-navy">
      <span className="text-ftt-gold">{icon}</span>
      {children}
    </div>
  );
}
