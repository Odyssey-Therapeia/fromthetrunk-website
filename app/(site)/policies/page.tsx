import type { Metadata } from "next";
import Link from "next/link";

import { policies } from "@/lib/legal/policies";
import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Policies",
  description:
    "Privacy, returns, refunds, shipping, authentication, and customer-care policies for From the Trunk.",
  path: "/policies",
});

const PROMISES = [
  {
    title: "7-day return review",
    body: "For significant misdescription, the wrong item, or an undisclosed major defect.",
  },
  {
    title: "Unique clarity",
    body: "Pre-loved condition and provenance are documented before every piece is listed.",
  },
  {
    title: "Secure checkout",
    body: "Payments are processed through trusted gateway partners — we never store your card details.",
  },
  {
    title: "Grievance support",
    body: "A named grievance officer and clear timelines if something needs to be made right.",
  },
];

export default function PoliciesPage() {
  return (
    <div className="bg-ftt-ivory text-ftt-midnight">
      <section className="px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-[2rem] border border-ftt-border shadow-[0_24px_70px_rgba(20,29,70,0.16)] lg:grid lg:grid-cols-[1fr_24rem]">
            <div
              className="p-6 text-ftt-ivory sm:p-8 lg:p-10"
              style={{
                background:
                  "linear-gradient(135deg, var(--ftt-royal-navy) 0%, var(--ftt-midnight) 58%, var(--ftt-burgundy) 150%)",
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-ftt-gold">
                Policies, clearly kept
              </p>
              <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.03em]">
                The small print, written with care.
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-ftt-ivory/75 sm:text-base">
                Everything you need to know before bringing a unique saree
                home — privacy, returns, shipping, authentication, care, and
                customer support.
              </p>
            </div>

            <div className="bg-ftt-card p-5 sm:p-6">
              <div className="grid h-full gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {PROMISES.map((promise) => (
                  <div
                    key={promise.title}
                    className="rounded-3xl border border-ftt-border bg-ftt-ivory p-4"
                  >
                    <p className="font-serif text-xl leading-tight text-ftt-navy">
                      {promise.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ftt-burgundy/65">
                      {promise.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {policies.map((policy) => (
              <Link
                key={policy.slug}
                href={`/policies/${policy.slug}`}
                className="group flex flex-col rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[0_14px_36px_rgba(20,29,70,0.07)] transition hover:-translate-y-1 hover:border-ftt-gold/60 hover:shadow-[0_18px_48px_rgba(20,29,70,0.10)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
                  {policy.eyebrow}
                </p>
                <h2 className="mt-4 font-serif text-2xl leading-tight text-ftt-navy sm:text-3xl">
                  {policy.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-ftt-burgundy/65">
                  {policy.description}
                </p>
                <span className="mt-6 inline-flex w-fit rounded-full border border-ftt-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ftt-burgundy transition group-hover:bg-ftt-gold/10">
                  Read policy
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
