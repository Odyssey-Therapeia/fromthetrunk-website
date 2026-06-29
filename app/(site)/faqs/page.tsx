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
import { safeJsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "FAQs & Policies",
  description:
    "Answers to common questions about From the Trunk: how we source, authenticate, and ship pre-loved luxury sarees, plus our privacy, returns, shipping, authentication, and customer-care policies.",
  path: "/faqs",
});

const FAQ_ITEMS = [
  {
    question: "What is From the Trunk?",
    answer:
      "From the Trunk is a curated marketplace for authenticated, pre-loved luxury sarees. We source forgotten treasures from homes across India, meticulously restore them, and give them a second life with a new custodian.",
  },
  {
    question: "How do we authenticate the sarees?",
    answer:
      "Every piece undergoes a rigorous 360° condition check. We inspect for tears, stains, zari integrity, and fabric quality before listing. Only pieces that pass our quality threshold make it to the collection.",
  },
  {
    question: "Are the sarees really pre-loved?",
    answer:
      "Yes. Every saree on From the Trunk has been owned and loved before. We believe pre-loved pieces carry unique provenance and character that new sarees simply cannot replicate.",
  },
  {
    question: "Do you offer returns?",
    answer:
      "We accept returns within 7 days of delivery if the piece is significantly different from its description. Because each saree is unique, we encourage you to reach out to us before initiating a return.",
  },
  {
    question: "How do you ship the sarees?",
    answer:
      "We ship all sarees carefully wrapped in tissue wrap, packed in our signature recycled saree cloth bag, and carefully nestled in our brand box. We ship across PAN India only, with no international shipping. Orders are dispatched through Shiprocket and/or DTDC.",
  },
  {
    question: "Can I sell my sarees through From the Trunk?",
    answer:
      "Yes! We welcome submissions from custodians who wish to pass on their sarees. Reach out to us at hello@fromthetrunk.shop with photos and provenance details.",
  },
  {
    question: "How do I care for my saree?",
    answer:
      "Dry clean only. Store them in a breathable muslin or cotton cloth bag and keep it away from direct sunlight and humidity. Avoid plastic storage as it can trap moisture and damage the fabric.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards, UPI, net banking, and wallets via our secure payment gateway. All transactions are processed in INR.",
  },
] as const;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
