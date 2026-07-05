import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Gem,
  HandHeart,
  Leaf,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { KeywordSubmissionCta } from "@/components/seo/keyword-submission-cta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

type ProcessItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function KeywordContentPage({ config }: KeywordContentPageProps) {
  const breadcrumbJsonLd = keywordBreadcrumbJsonLd(config);
  const faqJsonLd = keywordFaqJsonLd(config);
  const guideJsonLd = keywordGuideJsonLd(config);

  const isSupplyPage = config.type === "supply";
  const intro = config.intro.filter((paragraph) => paragraph.trim().length > 0);
  const leadParagraph = intro[0];
  const remainingIntro = intro.slice(1);
  const primaryHref =
    config.related[0]?.href ?? (isSupplyPage ? "/connect-with-us" : "/collection");

  const eyebrow = isSupplyPage
    ? "Sell with From the Trunk"
    : config.type === "guide"
      ? "FTT Guide"
      : "From the Trunk";

  const heroNote = isSupplyPage
    ? "A careful, respectful way to pass your saree into its next chapter."
    : "A quiet guide for choosing, caring for, and understanding pre-loved sarees.";

  const processItems: ProcessItem[] = isSupplyPage
    ? [
        {
          icon: HandHeart,
          title: "Share the piece",
          description:
            "Send us clear photographs, known fabric details, condition notes, and any memory or provenance you would like preserved.",
        },
        {
          icon: SearchCheck,
          title: "We review with care",
          description:
            "Our team checks craft, condition, wearability, market fit, and restoration needs before moving forward.",
        },
        {
          icon: Sparkles,
          title: "It is prepared",
          description:
            "Accepted sarees are documented, photographed, priced, and presented with the respect a one-of-one textile deserves.",
        },
      ]
    : [
        {
          icon: SearchCheck,
          title: "Understand the piece",
          description:
            "Learn what to look for in fabric, condition, craft, provenance, and styling before choosing your saree.",
        },
        {
          icon: ShieldCheck,
          title: "Trust the process",
          description:
            "FTT documents condition and textile details so every purchase feels considered, transparent, and personal.",
        },
        {
          icon: Leaf,
          title: "Choose consciously",
          description:
            "Pre-loved sarees keep craft in circulation and make luxury feel more thoughtful, personal, and lasting.",
        },
      ];

  return (
    <main className="relative isolate overflow-hidden bg-ftt-ivory text-ftt-midnight">
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

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-ftt-ivory" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(179,145,82,0.18),transparent_32%),radial-gradient(circle_at_88%_8%,rgba(20,29,70,0.12),transparent_34%),linear-gradient(180deg,#FDF7F1_0%,#F8EFE6_100%)]" />
        <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-ftt-gold/10 blur-3xl" />
        <div className="absolute -right-28 bottom-16 h-96 w-96 rounded-full bg-ftt-navy/10 blur-3xl" />
      </div>

      <article className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-burgundy/55"
        >
          <Link href="/" className="transition hover:text-ftt-navy">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 text-ftt-gold" />
          {config.type === "guide" ? (
            <>
              <span>Guides</span>
              <ChevronRight className="h-3 w-3 text-ftt-gold" />
            </>
          ) : null}
          <span className="text-ftt-navy">{config.h1}</span>
        </nav>

        <header className="mt-7 overflow-hidden rounded-[2.25rem] border border-ftt-gold/20 bg-ftt-navy text-ftt-ivory shadow-[0_30px_90px_rgba(20,29,70,0.24)]">
          <div className="relative grid gap-10 p-6 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ftt-gold/25 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(253,247,241,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(253,247,241,0.55) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />

            <div className="relative">
              <Badge className="rounded-full border border-ftt-gold/40 bg-ftt-gold/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold shadow-none">
                {config.primaryKeyword}
              </Badge>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.42em] text-ftt-gold">
                {eyebrow}
              </p>

              <h1 className="mt-5 max-w-4xl font-serif text-[clamp(3rem,7vw,6.4rem)] font-medium leading-[0.9] tracking-[-0.055em] text-ftt-ivory">
                {config.h1}
              </h1>

              {leadParagraph ? (
                <p className="mt-7 max-w-2xl text-base leading-8 text-ftt-ivory/76 sm:text-lg">
                  {leadParagraph}
                </p>
              ) : null}

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                {isSupplyPage ? (
                  <KeywordSubmissionCta label="Begin your submission" />
                ) : (
                  <Link
                    href={primaryHref}
                    className="group inline-flex items-center justify-center rounded-full bg-ftt-ivory px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-ftt-navy shadow-[0_16px_44px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-white"
                  >
                    Continue reading
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                )}

                {config.faq.length > 0 ? (
                  <Link
                    href="#questions"
                    className="inline-flex items-center justify-center rounded-full border border-ftt-ivory/24 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-ftt-ivory transition duration-300 hover:-translate-y-0.5 hover:border-ftt-gold hover:text-ftt-gold"
                  >
                    Common questions
                  </Link>
                ) : null}
              </div>
            </div>

            <aside className="relative">
              <Card className="overflow-hidden rounded-[2rem] border border-ftt-gold/25 bg-ftt-ivory/95 p-6 text-ftt-navy shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-ftt-gold">
                      FTT standard
                    </p>
                    <h2 className="mt-3 font-serif text-3xl leading-tight tracking-[-0.03em]">
                      {heroNote}
                    </h2>
                  </div>

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ftt-navy text-ftt-gold">
                    <Gem className="h-6 w-6" strokeWidth={1.6} />
                  </div>
                </div>

                <Separator className="my-6 bg-ftt-gold/20" />

                <div className="grid gap-3">
                  {[
                    ["Authenticated", "Every accepted piece is reviewed."],
                    ["Condition noted", "Marks, restoration, and care are documented."],
                    ["Story-led", "The saree is presented with context and respect."],
                  ].map(([title, text]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-ftt-gold/15 bg-white/70 p-4"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ftt-navy text-ftt-gold">
                          <BadgeCheck className="h-4 w-4" strokeWidth={1.7} />
                        </div>
                        <div>
                          <h3 className="font-serif text-xl leading-none text-ftt-navy">
                            {title}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-ftt-navy/66">
                            {text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </aside>
          </div>
        </header>

        {remainingIntro.length > 0 ? (
          <section className="mt-10 grid gap-8 lg:grid-cols-[0.74fr_1.26fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.36em] text-ftt-gold">
                The details
              </p>
              <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.04em] text-ftt-navy sm:text-5xl">
                A clear path, handled with care.
              </h2>
            </div>

            <Card className="rounded-[2rem] border border-ftt-gold/16 bg-white/74 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.08)] backdrop-blur sm:p-8">
              <div className="space-y-5 text-base leading-8 text-ftt-burgundy/76">
                {remainingIntro.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </Card>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.36em] text-ftt-gold">
                How it flows
              </p>
              <h2 className="mt-3 font-serif text-4xl tracking-[-0.04em] text-ftt-navy">
                {isSupplyPage ? "From your trunk to ours" : "Read with confidence"}
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {processItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <Card
                  key={item.title}
                  className="group h-full rounded-[2rem] border border-ftt-gold/16 bg-white/74 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.08)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-ftt-gold/36 hover:shadow-[0_26px_80px_rgba(20,29,70,0.12)]"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ftt-navy text-ftt-gold transition duration-300 group-hover:bg-ftt-burgundy">
                      <Icon className="h-5 w-5" strokeWidth={1.65} />
                    </div>

                    <span className="font-serif text-4xl leading-none text-ftt-gold/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <h3 className="mt-6 font-serif text-3xl tracking-[-0.03em] text-ftt-navy">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-ftt-burgundy/68">
                    {item.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>

        <section
          id="continue"
          className="mt-10 overflow-hidden rounded-[2rem] border border-ftt-navy/10 bg-ftt-burgundy text-ftt-ivory shadow-[0_26px_80px_rgba(96,29,28,0.18)]"
        >
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.36em] text-ftt-gold">
                Continue from here
              </p>
              <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.04em]">
                Explore the next part of the trunk.
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {config.related.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group inline-flex items-center rounded-full border border-ftt-ivory/16 bg-ftt-ivory/9 px-4 py-2.5 text-sm font-medium text-ftt-ivory transition duration-300 hover:-translate-y-0.5 hover:border-ftt-gold hover:bg-ftt-ivory hover:text-ftt-navy"
                >
                  {link.label}
                  <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {config.faq.length > 0 ? (
          <section id="questions" className="mt-12">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.36em] text-ftt-gold">
                Common questions
              </p>
              <h2 className="mt-3 font-serif text-4xl tracking-[-0.04em] text-ftt-navy">
                Everything you may want to ask first.
              </h2>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {config.faq.map((item) => (
                <Card
                  key={item.question}
                  className="rounded-[1.75rem] border border-ftt-gold/16 bg-white/76 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.07)] backdrop-blur"
                >
                  <div className="flex gap-4">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ftt-navy text-ftt-gold">
                      <CircleHelp className="h-4 w-4" strokeWidth={1.7} />
                    </div>

                    <div>
                      <h3 className="font-serif text-2xl leading-tight tracking-[-0.02em] text-ftt-navy">
                        {item.question}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-ftt-burgundy/70">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}