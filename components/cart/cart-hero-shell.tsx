import { LockKeyhole, PackageCheck, ShieldCheck } from "lucide-react";

import { CartHeroStats } from "@/components/cart/cart-hero-stats";

export function CartHeroShell() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#E7DDD4] bg-[#141D46] shadow-[0_18px_55px_rgba(20,29,70,0.16)] lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="bg-[linear-gradient(135deg,#141D46_0%,#10183B_62%,#601D1C_150%)] p-6 text-[#FDF7F1] sm:p-8 lg:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#B39152]">
          Shopping Bag
        </p>

        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(3rem,7vw,6.5rem)] font-medium leading-[0.92] text-[#FDF7F1]">
          Your trunk selection.
        </h1>

        <p className="mt-5 max-w-xl text-sm leading-7 text-[#FDF7F1]/72 sm:text-base">
          Review the pieces you have chosen before checkout. Each saree is
          authenticated, packed with care, and sent with its story intact.
        </p>

        <CartHeroStats />
      </div>

      <div className="border-t border-white/10 bg-[#FDF7F1] p-5 lg:border-l lg:border-t-0">
        <div className="flex h-full min-h-[260px] flex-col justify-between rounded-[1.5rem] border border-[#B39152]/35 bg-[#FFFCF8] p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#74531B]">
              Trunk assurance
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-none text-[#141D46]">
              Not pre-owned. Re-stored.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6B625B]">
              A final review before your heirloom continues its next life.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <AssuranceRow icon={<ShieldCheck className="h-4 w-4" />}>
              Authentication checked
            </AssuranceRow>
            <AssuranceRow icon={<PackageCheck className="h-4 w-4" />}>
              Secure trunk packing
            </AssuranceRow>
            <AssuranceRow icon={<LockKeyhole className="h-4 w-4" />}>
              Checkout protected
            </AssuranceRow>
          </div>
        </div>
      </div>
    </section>
  );
}

function AssuranceRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-2 text-sm font-medium text-[#141D46]">
      <span className="text-[#B39152]">{icon}</span>
      {children}
    </div>
  );
}
