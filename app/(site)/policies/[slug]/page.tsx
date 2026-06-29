import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPolicyBySlug, policies } from "@/lib/legal/policies";
import { publicPageMetadata } from "@/lib/seo/metadata";

type PolicyPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return policies.map((policy) => ({ slug: policy.slug }));
}

export async function generateMetadata({
  params,
}: PolicyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicyBySlug(slug);
  if (!policy) return { title: "Policy" };
  return publicPageMetadata({
    title: policy.title,
    description: policy.description,
    path: `/policies/${policy.slug}`,
  });
}

export default async function PolicyPage({ params }: PolicyPageProps) {
  const { slug } = await params;
  const policy = getPolicyBySlug(slug);
  if (!policy) notFound();

  return (
    <div className="bg-ftt-ivory text-ftt-midnight">
      <section className="px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-7xl">
          <div
            className="mb-8 rounded-[2rem] border border-ftt-border p-6 text-ftt-ivory shadow-[0_22px_60px_rgba(20,29,70,0.14)] sm:p-8 lg:p-10"
            style={{
              background:
                "linear-gradient(135deg, var(--ftt-royal-navy) 0%, var(--ftt-midnight) 70%)",
            }}
          >
            <Link
              href="/policies"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-ftt-gold underline-offset-4 hover:underline"
            >
              ← All policies
            </Link>

            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.38em] text-ftt-gold">
              {policy.eyebrow}
            </p>
            <h1 className="mt-4 max-w-4xl font-serif text-[clamp(2.4rem,5.5vw,5rem)] leading-[0.95]">
              {policy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-ftt-ivory/75 sm:text-base">
              {policy.description}
            </p>
            <p className="mt-6 text-xs text-ftt-ivory/55">
              Last updated: {policy.lastUpdated}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <nav className="sticky top-28 rounded-3xl border border-ftt-border bg-ftt-card p-4 shadow-[0_14px_36px_rgba(20,29,70,0.07)]">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
                  Sections
                </p>
                <div className="space-y-1">
                  {policy.sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="block rounded-full px-3 py-2 text-sm text-ftt-burgundy/65 transition hover:bg-ftt-gold/10 hover:text-ftt-navy"
                    >
                      {section.title}
                    </a>
                  ))}
                </div>
              </nav>
            </aside>

            <article className="rounded-[1.75rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] sm:p-8 lg:p-10">
              <div className="space-y-10">
                {policy.sections.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-28 border-b border-ftt-border pb-8 last:border-b-0 last:pb-0"
                  >
                    <h2 className="font-serif text-2xl leading-tight text-ftt-navy sm:text-3xl">
                      {section.title}
                    </h2>
                    <div className="mt-4 space-y-4">
                      {section.body.map((paragraph, index) => (
                        <p
                          key={index}
                          className="text-sm leading-7 text-ftt-burgundy/75 sm:text-base sm:leading-8"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-10 rounded-3xl border border-ftt-gold/30 bg-ftt-gold/10 p-5">
                <p className="font-serif text-2xl text-ftt-navy">
                  Need help with this policy?
                </p>
                <p className="mt-2 text-sm leading-6 text-ftt-burgundy/70">
                  Write to us with your order number or question and our team
                  will help you.
                </p>
                <a
                  href="mailto:hello@fromthetrunk.shop"
                  className="mt-4 inline-flex rounded-full bg-ftt-navy px-5 py-3 text-sm font-medium text-ftt-ivory transition hover:bg-ftt-midnight"
                >
                  Contact customer care
                </a>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
