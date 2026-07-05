/**
 * FAQs & Policies page — policy glimpses on top, FAQ cards below.
 *
 * Emits valid schema.org FAQPage JSON-LD inline via safeJsonLd() (</script>
 * injection-safe), so we keep the SEO benefit while rendering our own card UI
 * instead of the generic FAQ accordion block.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { policies } from "@/lib/legal/policies";
import { FAQ_ITEMS, faqJsonLd } from "@/lib/seo/faq-content";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";

const faqDescription =
  "Answers to common questions about authenticated pre-loved sarees, saree care, selling your saree, shipping, returns, and one-of-one checkout at From the Trunk.";

const faqSocialDescription =
  "Explore answers about authenticated pre-loved sarees, saree care, selling your saree, shipping, returns, and one-of-one pieces.";

const faqBaseMetadata = publicPageMetadata({
  title: "FAQs — Pre-Loved Sarees, Care & Selling | From the Trunk",
  description: faqDescription,
  path: "/faqs",
  image: {
    alt: "From the Trunk FAQ guide for authenticated pre-loved sarees",
  },
});

export const metadata: Metadata = {
  ...faqBaseMetadata,
  title: {
    absolute: "FAQs — Pre-Loved Sarees, Care & Selling | From the Trunk",
  },
  openGraph: {
    ...(faqBaseMetadata.openGraph ?? {}),
    title: "FAQs — From the Trunk",
    description: faqSocialDescription,
  },
  twitter: {
    ...(faqBaseMetadata.twitter ?? {}),
    title: "FAQs — From the Trunk",
    description: faqSocialDescription,
  },
};

export default function FaqsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <header className="mb-12 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Support
        </p>
        <h1 className="font-serif text-4xl text-foreground md:text-5xl">
          FAQs &amp; Policies
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          Everything you need before bringing a unique piece home. Read our
          policies, then the answers to common questions.
        </p>
      </header>

      {/* Policies — top */}
      <section>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-ftt-gold">
            Policies
          </p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Our policies, in a glimpse
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            Tap &ldquo;Know more&rdquo; on any policy to read it in full.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policies.map((policy) => (
            <Link
              key={policy.slug}
              href={`/policies/${policy.slug}`}
              className="group flex flex-col rounded-2xl border border-border/60 bg-card/70 p-5 shadow-[var(--ftt-soft-shadow)] transition hover:-translate-y-1 hover:border-ftt-gold/60"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
                {policy.eyebrow}
              </p>
              <h3 className="mt-3 font-serif text-2xl leading-tight text-foreground">
                {policy.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {policy.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-ftt-burgundy">
                Know more
                <span
                  aria-hidden
                  className="transition group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/policies"
            className="inline-flex items-center gap-1 rounded-full border border-ftt-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-ftt-burgundy transition hover:bg-ftt-gold/10"
          >
            View all policies →
          </Link>
        </div>
      </section>

      {/* FAQs — bottom, as small responsive cards */}
      <section className="mt-16 border-t border-border/60 pt-12">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Need help?
          </p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Common questions, answered
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.question}
              className="flex flex-col rounded-2xl border border-border/60 bg-card/70 p-5 shadow-[var(--ftt-soft-shadow)]"
            >
              <h3 className="font-serif text-lg font-semibold leading-snug text-foreground">
                {item.question}
              </h3>
              <div className="mt-3 h-px w-8 bg-ftt-gold/40" />
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {item.answer}
              </p>
              {item.links?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center rounded-full border border-ftt-gold/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy transition hover:bg-ftt-gold/10"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
