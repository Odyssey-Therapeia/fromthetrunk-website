import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  PackageCheck,
  Search,
  Sparkles,
  Store,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const heroImage = {
  src: "/404/Empty_Collection_Filter_Result.avif",
  alt: "Open trunk with folded sarees and an empty story-card compartment",
  width: 1448,
  height: 1086,
};

const searchChips = ["Banarasi", "Kanjeevaram", "Silk", "Heirloom", "Festive"];

const whatsappHref =
  "https://wa.me/919731910202?text=Hi%20From%20the%20Trunk%2C%20I%27m%20looking%20for%20a%20specific%20saree.";

const reportHref =
  "mailto:hello@fromthetrunk.shop?subject=Missing%20link%20on%20From%20the%20Trunk";

const recoveryCards = [
  {
    title: "New Arrivals from the Trunk",
    body: "Freshly curated sarees selected for craft, condition, and quiet distinction.",
    cta: "Explore new pieces",
    href: "/collection",
    Icon: Sparkles,
  },
  {
    title: "Sarees with a Story",
    body: "Browse one-of-one pieces with provenance, memory, and a second life ahead.",
    cta: "Browse the collection",
    href: "/collection",
    Icon: Store,
  },
  {
    title: "What Pre-loved Means",
    body: "Learn how every piece is reviewed, condition graded, and prepared with care.",
    cta: "Learn the process",
    href: "/how-it-works",
    Icon: PackageCheck,
  },
  {
    title: "Open Your Trunk",
    body: "Have a saree waiting for its next story? Share it with From the Trunk.",
    cta: "Submit your saree",
    href: "/sell-your-saree",
    Icon: BookOpen,
  },
] as const;

export function BrandedNotFound() {
  return (
    <div className="overflow-hidden bg-[linear-gradient(180deg,#fdf7f1_0%,#fffaf3_44%,#f6ecdf_100%)]">
      <section className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-18 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-center lg:px-8 lg:pb-24 lg:pt-18">
        <div
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#B39152]/35 to-transparent"
          aria-hidden="true"
        />

        <div className="relative z-10 space-y-7">
          <div className="space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
              Missing chapter &middot; 404
            </p>
            <div className="space-y-4">
              <h1 className="max-w-3xl font-serif text-5xl font-medium leading-[0.94] text-[#141D46] sm:text-6xl lg:text-7xl">
                This piece isn&apos;t in the trunk.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#601D1C]/76 sm:text-lg sm:leading-8">
                The page may have moved, or the piece may have already found
                its next wardrobe. Explore the collection to discover another
                story in silk.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              className="h-12 rounded-full bg-[#601D1C] px-7 text-sm font-semibold tracking-[0.02em] text-[#FDF7F1] shadow-[0_16px_34px_rgba(96,29,28,0.2)] hover:bg-[#3C0C0F] focus-visible:ring-[#B39152]"
            >
              <Link href="/collection">
                Browse the Collection
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-[#601D1C]/18 bg-[#FFFCF8]/80 px-7 text-sm font-semibold text-[#601D1C] shadow-sm hover:bg-[#601D1C]/7 hover:text-[#601D1C] focus-visible:ring-[#B39152]"
            >
              <Link href="/">Return Home</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 rounded-full px-7 text-sm font-semibold text-[#141D46] hover:bg-[#141D46]/7 hover:text-[#141D46] focus-visible:ring-[#B39152]"
            >
              <Link href="/our-story">Read Our Story</Link>
            </Button>
          </div>

          <div className="max-w-2xl rounded-3xl border border-[#E7DDD4] bg-[#FFFCF8]/88 p-4 shadow-[0_18px_50px_rgba(20,29,70,0.09)] sm:p-5">
            <form action="/search" method="get" className="space-y-3">
              <label
                htmlFor="not-found-search"
                className="block text-xs font-semibold uppercase tracking-[0.22em] text-[#601D1C]/72"
              >
                Looking for something specific?
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B39152]"
                    aria-hidden="true"
                  />
                  <input
                    id="not-found-search"
                    name="q"
                    type="search"
                    placeholder="Search by fabric, color, occasion, or story&hellip;"
                    className="h-12 w-full rounded-full border border-[#601D1C]/14 bg-white/72 pl-11 pr-4 text-sm text-[#2E2017] shadow-inner outline-none transition placeholder:text-[#6B625B]/62 focus:border-[#B39152] focus:ring-2 focus:ring-[#B39152]/28"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-12 rounded-full bg-[#141D46] px-6 text-sm font-semibold text-[#FDF7F1] hover:bg-[#0E0D0E] focus-visible:ring-[#B39152]"
                >
                  Search
                </Button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {searchChips.map((term) => (
                <Link
                  key={term}
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="rounded-full border border-[#B39152]/30 bg-[#FDF7F1] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#601D1C] transition hover:border-[#601D1C]/35 hover:bg-[#601D1C] hover:text-[#FDF7F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCF8]"
                >
                  {term}
                </Link>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-[#601D1C]/10 pt-4 text-sm leading-6 text-[#6B625B] sm:flex-row sm:items-center sm:justify-between">
              <p>
                Looking for a specific saree? Chat with us and we&apos;ll help
                you trace it.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-[#601D1C] underline-offset-4 transition hover:text-[#141D46] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCF8]"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Chat with us
                </a>
                <a
                  href={reportHref}
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6B625B] underline-offset-4 transition hover:text-[#601D1C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCF8]"
                >
                  Report this missing link
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div
            className="absolute -left-4 top-10 h-24 w-px bg-gradient-to-b from-transparent via-[#B39152]/45 to-transparent sm:left-3"
            aria-hidden="true"
          />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#B39152]/28 bg-[#FFFCF8] p-2 shadow-[0_28px_80px_rgba(20,29,70,0.16)] sm:p-3">
            <div className="absolute left-5 top-5 z-10 rounded-full border border-[#B39152]/30 bg-[#FFFCF8]/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#601D1C] shadow-sm backdrop-blur">
              404
            </div>
            <Image
              src={heroImage.src}
              alt={heroImage.alt}
              width={heroImage.width}
              height={heroImage.height}
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="aspect-[4/3] w-full rounded-[1.5rem] object-cover"
            />
          </div>
          <p className="mt-4 text-center font-serif text-xl leading-7 text-[#601D1C]/80 sm:text-2xl">
            Some treasures aren&apos;t made. They&apos;re found.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="mb-7 max-w-3xl">
          <h2 className="font-serif text-4xl font-medium leading-tight text-[#141D46] sm:text-5xl">
            Still waiting to be discovered
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#601D1C]/72">
            The trunk still holds stories in silk, carefully authenticated and
            ready for their next wardrobe.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recoveryCards.map(({ title, body, cta, href, Icon }) => (
            <Link
              key={title}
              href={href}
              className="group flex min-h-[15.5rem] flex-col justify-between rounded-3xl border border-[#E7DDD4] bg-[#FFFCF8]/88 p-5 shadow-[0_14px_34px_rgba(20,29,70,0.08)] transition hover:-translate-y-0.5 hover:border-[#B39152]/50 hover:shadow-[0_22px_48px_rgba(20,29,70,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] motion-reduce:hover:translate-y-0"
            >
              <div className="space-y-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B39152]/24 bg-[#FDF7F1] text-[#601D1C]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl font-medium leading-7 text-[#141D46]">
                    {title}
                  </h3>
                  <p className="text-sm leading-6 text-[#6B625B]">{body}</p>
                </div>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#601D1C] transition group-hover:text-[#141D46]">
                {cta}
                <ArrowRight
                  className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
