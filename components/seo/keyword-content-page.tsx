import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  keywordBreadcrumbJsonLd,
  keywordFaqJsonLd,
  keywordGuideJsonLd,
  type KeywordLandingConfig,
} from "@/lib/seo/keyword-landing-pages";
import { safeJsonLd } from "@/lib/seo/json-ld";

type KeywordContentPageProps = {
  config: KeywordLandingConfig;
};

export function KeywordContentPage({ config }: KeywordContentPageProps) {
  const breadcrumbJsonLd = keywordBreadcrumbJsonLd(config);
  const faqJsonLd = keywordFaqJsonLd(config);
  const guideJsonLd = keywordGuideJsonLd(config);

  return (
    <main className="bg-ftt-ivory text-ftt-midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(guideJsonLd) }}
      />
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      ) : null}

      <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/55"
        >
          <Link href="/" className="hover:text-ftt-navy">
            Home
          </Link>
          <span>/</span>
          {config.type === "guide" ? (
            <>
              <span>Guides</span>
              <span>/</span>
            </>
          ) : null}
          <span className="text-ftt-navy">{config.h1}</span>
        </nav>

        <header className="mt-8">
          <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-ftt-gold">
            {config.primaryKeyword}
          </Badge>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.8rem,7vw,6rem)] leading-[0.92] text-ftt-burgundy">
            {config.h1}
          </h1>
        </header>

        <div className="mt-8 space-y-5 text-base leading-8 text-ftt-burgundy/76">
          {config.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <section className="mt-10 rounded-[1.5rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] sm:p-6">
          <h2 className="font-serif text-3xl text-ftt-navy">
            Continue from here
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {config.related.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-ftt-border bg-ftt-ivory px-4 py-2 text-sm font-medium text-ftt-burgundy transition hover:border-ftt-gold hover:text-ftt-navy"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        {config.faq.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-serif text-3xl text-ftt-navy">
              Common questions
            </h2>
            <div className="mt-5 grid gap-4">
              {config.faq.map((item) => (
                <div
                  key={item.question}
                  className="rounded-[1.25rem] border border-ftt-border bg-ftt-card p-5"
                >
                  <h3 className="font-semibold text-ftt-burgundy">
                    {item.question}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-ftt-burgundy/70">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}
