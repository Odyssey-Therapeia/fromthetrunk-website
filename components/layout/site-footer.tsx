import Image from "next/image";
import Link from "next/link";
import { FooterNewsletterForm } from "@/components/layout/footer-newsletter-form";
import type { FooterSection } from "@/components/layout/nav-data";

const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Explore",
    links: [
      { href: "/collection", label: "The Collection" },
      { href: "/our-story", label: "Our Story" },
      { href: "/why", label: "Our Why" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/faqs", label: "FAQs" },
      { href: "/sell-your-saree", label: "Sell Your Saree" },
      { href: "/our-team", label: "Our Team" },
      {
        href: "/guides/what-is-a-pre-loved-saree",
        label: "What Pre-Loved Means",
      },
    ],
  },
  {
    title: "Shop By",
    links: [
      { href: "/collection/fabric/silk", label: "Pre-Loved Silk Sarees" },
      { href: "/collection/occasion/festive", label: "Festive Sarees" },
      {
        href: "/guides/pre-loved-vs-second-hand-saree",
        label: "Pre-Loved vs Second-Hand",
      },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { href: "/policies/shipping-delivery-policy", label: "Shipping" },
      { href: "/policies/return-refund-policy", label: "Returns & Refunds" },
      {
        href: "/policies/authentication-condition-policy",
        label: "Authentication",
      },
      { href: "/policies/care-packaging-policy", label: "Care & Packaging" },
      { href: "/policies/sell-with-us-policy", label: "Sell With Us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/policies/privacy-policy", label: "Privacy Policy" },
      { href: "/policies/terms-of-service", label: "Terms of Service" },
      { href: "/policies/grievance-redressal", label: "Grievance Redressal" },
      { href: "/policies", label: "All Policies" },
    ],
  },
];

type IconProps = {
  className?: string;
};

function InstagramIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17.2 6.8h.01" />
    </svg>
  );
}

function WhatsAppIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M5 18.2 3.8 22l4-1.1A9 9 0 1 0 5 18.2Z" />
      <path d="M8.7 10.2c.5 1.7 1.9 3 3.4 3.8.8.4 1.5.6 2.2.5.5-.1.9-.6 1.1-1" />
    </svg>
  );
}

function OrnamentIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 42 14"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      aria-hidden="true"
    >
      <path d="M1 7h14" />
      <path d="M27 7h14" />
      <path d="M21 2.2c2.1 1.7 3.2 3.3 3.2 4.8S23.1 10.1 21 11.8c-2.1-1.7-3.2-3.3-3.2-4.8S18.9 3.9 21 2.2Z" />
      <path d="M21 5c.9.7 1.3 1.4 1.3 2s-.4 1.3-1.3 2c-.9-.7-1.3-1.4-1.3-2s.4-1.3 1.3-2Z" />
    </svg>
  );
}

function SearchGemIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="10" />
      <path d="m28 28 10 10" />
      <path d="M16 19.5 20 15l4 4.5-4 5-4-5Z" />
    </svg>
  );
}

function CareIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M24 31c-5.5-3.4-10-7.2-10-12a5.4 5.4 0 0 1 9.6-3.4A5.4 5.4 0 0 1 34 19c0 4.8-4.5 8.6-10 12Z" />
      <path d="M13 37c4 2.6 7.6 3.9 11 3.9S31 39.6 35 37" />
      <path d="M10 30c3 2.4 4.6 5.2 5 8" />
      <path d="M38 30c-3 2.4-4.6 5.2-5 8" />
    </svg>
  );
}

function SealIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M24 5 29 9l6-.5 2.5 5.5 5.5 2.5-.5 6 4 5-4 5 .5 6-5.5 2.5-2.5 5.5-6-.5-5 4-5-4-6 .5-2.5-5.5L5 38.5l.5-6-4-5 4-5-.5-6 5.5-2.5L13 8.5l6 .5 5-4Z" />
      <path d="m18.5 24 3.8 3.8 7.2-7.4" />
    </svg>
  );
}

function GiftIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19h30v22H9z" />
      <path d="M9 19h30v8H9z" />
      <path d="M24 19v22" />
      <path d="M24 19c-5-1-8.5-4-8.5-7 0-2.2 1.7-3.8 4-3.8 2.8 0 4.5 3.8 4.5 10.8Z" />
      <path d="M24 19c5-1 8.5-4 8.5-7 0-2.2-1.7-3.8-4-3.8-2.8 0-4.5 3.8-4.5 10.8Z" />
    </svg>
  );
}

function CompactArchLineArt() {
  return (
    <svg
      viewBox="0 0 280 300"
      className="absolute left-0 top-0 h-[250px] w-[250px] text-[#B39152]/32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      <path d="M22 296V135C22 58 73 18 140 18s118 40 118 117v161" />
      <path d="M38 205c16-26 41-39 76-39" opacity=".55" />
      <path d="M242 205c-16-26-41-39-76-39" opacity=".55" />
      <path d="M140 147c-8-19-6-35 0-50 6 15 8 31 0 50Z" />
      <path d="M122 156c-18-8-28-19-33-35 17 3 29 13 33 35Z" />
      <path d="M158 156c18-8 28-19 33-35-17 3-29 13-33 35Z" />
      <path d="M118 174c-17 2-31-4-42-16 16-6 30-1 42 16Z" />
      <path d="M162 174c17 2 31-4 42-16-16-6-30-1-42 16Z" />
    </svg>
  );
}

function MiniKeyhole() {
  return (
    <svg
      viewBox="0 0 40 30"
      className="h-6 w-8 text-[#B39152]"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 2c-8 4-12 10-12 18v5h24v-5C32 12 28 6 20 2Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M20 12a4 4 0 0 0-2 7.4V25h4v-5.6A4 4 0 0 0 20 12Z"
        fill="currentColor"
        opacity=".82"
      />
    </svg>
  );
}

function FooterGoldRail() {
  return (
    <div
      className="relative h-8 overflow-visible border-t border-[#B39152]/55 bg-[#050814]/90 sm:h-9"
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 h-full w-full text-[#B39152]/58"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="ftt-compact-footer-motif"
            width="92"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M46 5c4.4 4.2 6.6 8 6.6 11.5S50.4 24 46 31c-4.4-7-6.6-11-6.6-14.5S41.6 9.2 46 5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth=".9"
              opacity=".9"
            />
            <path
              d="M23 18c6.2-5.8 12-5.8 18 0-6 5.8-11.8 5.8-18 0Z"
              fill="none"
              stroke="currentColor"
              strokeWidth=".8"
              opacity=".72"
            />
            <path
              d="M51 18c6-5.8 11.8-5.8 18 0-6.2 5.8-12 5.8-18 0Z"
              fill="none"
              stroke="currentColor"
              strokeWidth=".8"
              opacity=".72"
            />
            <path
              d="M0 18h15M77 18h15"
              stroke="currentColor"
              strokeWidth=".75"
              opacity=".55"
            />
            <circle cx="46" cy="18" r="1.8" fill="currentColor" opacity=".65" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#ftt-compact-footer-motif)" />
      </svg>

      <div className="absolute left-1/2 top-[-18px] grid h-10 w-14 -translate-x-1/2 place-items-center rounded-t-full border border-[#B39152]/65 bg-[#601D1C] shadow-[0_0_24px_rgba(179,145,82,0.16)] sm:top-[-21px] sm:h-12 sm:w-16">
        <MiniKeyhole />
      </div>
    </div>
  );
}

const FOOTER_VALUES = [
  {
    title: "Curated with intention",
    copy: "Handpicked with history.",
    Icon: SearchGemIcon,
  },
  {
    title: "Restored with care",
    copy: "Preserved, repaired, loved.",
    Icon: CareIcon,
  },
  {
    title: "Authentic & trusted",
    copy: "Quality checked. Original.",
    Icon: SealIcon,
  },
  {
    title: "Sustainable luxury",
    copy: "Pre-loved, forever-worthy.",
    Icon: GiftIcon,
  },
];

function FooterMobileNav({
  footerSections,
}: {
  footerSections: FooterSection[];
}) {
  return (
    <nav className="md:hidden" aria-label="Footer navigation mobile">
      <div className="divide-y divide-[#B39152]/20 border-y border-[#B39152]/28">
        {footerSections.map((section) => (
          <details key={section.title} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B39152] marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{section.title}</span>
              <span className="text-sm transition group-open:rotate-45">＋</span>
            </summary>

            <ul className="grid gap-1 pb-4 text-sm text-[#FDF7F1]/68">
              {section.links.map((link) => (
                <li key={`${section.title}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="block rounded-md py-1.5 transition hover:text-[#FDF7F1]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </nav>
  );
}

export function SiteFooter({
  footerSections = DEFAULT_FOOTER_SECTIONS,
}: {
  footerSections?: FooterSection[];
}) {
  const year = new Date().getFullYear();

  const footerNavGridClass =
    footerSections.length <= 3
      ? "lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3"
      : "lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4";

  return (
    <footer className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(179,145,82,0.13),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(96,29,28,0.22),transparent_34%),linear-gradient(180deg,#141D46_0%,#070A17_100%)] text-[#FDF7F1]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(253,247,241,0.025)_1px,transparent_1px)] bg-[size:96px_96px] opacity-25" />

      <div className="relative mx-auto w-full max-w-[1680px] px-5 pt-8 sm:px-6 lg:px-10 2xl:px-14">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] 2xl:grid-cols-[640px_minmax(0,1fr)_330px] 2xl:gap-10">
          <section
            className="grid gap-6 max-md:text-center md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[285px_minmax(0,1fr)]"
            aria-labelledby="footer-story-title"
          >
            <div className="relative hidden h-[235px] md:block xl:h-[250px] 2xl:h-[285px]">
              <CompactArchLineArt />

              <Image
                src="/footer/ftt-trunk-saree.webp"
                alt=""
                width={520}
                height={400}
                loading="lazy"
                className="absolute bottom-[-4px] left-[-54px] z-10 w-[315px] max-w-none object-contain drop-shadow-[0_24px_44px_rgba(0,0,0,0.48)] xl:left-[-72px] xl:w-[330px] 2xl:left-[-92px] 2xl:w-[380px]"
              />
            </div>

            <div className="self-center">
              <div className="flex w-fit rounded-[22px] border border-[#B39152]/30 bg-[#FDF7F1] px-4 py-2.5 shadow-[0_14px_32px_rgba(0,0,0,0.25)] max-md:mx-auto">
                <Image
                  src="/Ftt_logo_navbar.png"
                  alt="From the Trunk"
                  width={132}
                  height={52}
                  className="h-10 w-auto object-contain"
                />
              </div>

              <div className="my-5 flex max-w-[230px] items-center gap-3 text-[#B39152]/75 max-md:mx-auto">
                <span className="h-px flex-1 bg-[#B39152]/45" />
                <OrnamentIcon className="h-3.5 w-10" />
                <span className="h-px flex-1 bg-[#B39152]/45" />
              </div>

              <h2
                id="footer-story-title"
                className="max-w-[320px] font-serif text-[2rem] leading-[1.05] text-[#FDF7F1] max-md:mx-auto sm:text-[2.35rem] 2xl:text-[2.55rem]"
              >
                Heirloom sarees,{" "}
                <em className="font-normal text-[#B39152]">reborn</em> for
                today.
              </h2>

              <p className="mt-4 max-w-[295px] text-sm leading-6 text-[#FDF7F1]/68 max-md:mx-auto">
                Every saree holds a story. We restore timeless weaves with care,
                so they can be cherished again.
              </p>

              <Link
                href="/our-story"
                className="group mt-5 inline-flex items-center gap-3 border-b border-[#B39152] pb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#B39152] transition hover:text-[#FDF7F1]"
              >
                Our Story
                <span className="transition group-hover:translate-x-1">✦</span>
              </Link>
            </div>
          </section>

          <nav
            className={`hidden gap-5 md:grid md:grid-cols-2 ${footerNavGridClass}`}
            aria-label="Footer navigation"
          >
            {footerSections.map((section) => (
              <div
                key={section.title}
                className="border-l border-[#B39152]/22 pl-6"
              >
                <div className="mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                    {section.title}
                  </p>
                  <OrnamentIcon className="mt-2 h-3 w-9 text-[#B39152]/72" />
                </div>

                <ul className="space-y-1 text-[13px] leading-5 text-[#FDF7F1]/64">
                  {section.links.map((link) => (
                    <li key={`${section.title}-${link.label}`}>
                      <Link
                        href={link.href}
                        className="block rounded-md py-1 transition hover:translate-x-1 hover:text-[#FDF7F1]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <FooterMobileNav footerSections={footerSections} />

          <section className="border-t border-[#B39152]/24 pt-5 xl:col-span-2 2xl:col-span-1 2xl:border-l 2xl:border-t-0 2xl:pl-7 2xl:pt-0">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] md:items-end 2xl:block">
              <div className="max-md:text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                  Stay in the loop
                </p>

                <OrnamentIcon className="mt-2 h-3 w-9 text-[#B39152]/72 max-md:mx-auto" />

                <p className="mt-4 max-w-sm text-sm leading-6 text-[#FDF7F1]/68 max-md:mx-auto">
                  New drops, rare finds, and quiet stories from the trunk.
                </p>
              </div>

              <div className="w-full max-w-md max-md:mx-auto md:max-w-none 2xl:mt-7 [&_form]:w-full [&_input]:min-w-0">
                <FooterNewsletterForm />

                <div className="mt-5 flex flex-wrap items-center gap-3 max-md:justify-center">
                  <a
                    href="https://www.instagram.com/from.thetrunk/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Follow From the Trunk on Instagram"
                  >
                    <InstagramIcon className="h-4 w-4" />
                  </a>

                  <a
                    href="https://wa.me/919731910202"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Chat with From the Trunk on WhatsApp"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </a>

                  <a
                    href="mailto:hello@fromthetrunk.shop"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Email From the Trunk"
                  >
                    <span className="text-sm">✉</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section
          className="relative mt-7 grid sm:grid-cols-2 xl:grid-cols-4 before:absolute before:left-1/2 before:top-0 before:h-px before:w-screen before:-translate-x-1/2 before:bg-[#B39152]/35 before:content-[''] after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-screen after:-translate-x-1/2 after:bg-[#B39152]/35 after:content-['']"
          aria-label="From The Trunk values"
        >
          {FOOTER_VALUES.map(({ title, copy, Icon }, index) => {
            const isLast = index === FOOTER_VALUES.length - 1;
            const isSecond = index === 1;

            return (
              <div
                key={title}
                className={[
                  "grid grid-cols-[32px_1fr] gap-3 py-4 sm:px-5 xl:grid-cols-[34px_1fr] xl:gap-4 xl:px-6",
                  "border-b border-[#B39152]/22 sm:border-r xl:border-b-0",
                  isSecond ? "sm:border-r-0 xl:border-r" : "",
                  isLast ? "border-b-0 sm:border-r-0 xl:border-r-0" : "",
                ].join(" ")}
              >
                <Icon className="h-7 w-7 text-[#B39152] xl:h-8 xl:w-8" />
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B39152] xl:text-[11px] xl:tracking-[0.2em]">
                    {title}
                  </h3>
                  <p className="mt-1 text-[12.5px] leading-5 text-[#FDF7F1]/64 xl:text-[13px]">
                    {copy}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        <div className="grid grid-cols-1 items-center gap-3 py-4 text-center text-[12px] text-[#FDF7F1]/58 md:grid-cols-[1fr_auto_1fr] md:text-left">
          <p>© {year} From The Trunk. All rights reserved.</p>

          <p className="text-center uppercase leading-5 tracking-[0.18em] text-[#B39152] sm:tracking-[0.24em]">
            Some treasures aren&apos;t made.
            <span className="block pt-1 md:inline md:pl-6 md:pt-0">
              They&apos;re found.
            </span>
          </p>

          <p className="md:text-right">
            Made with <span className="text-[#C76B57]">♡</span> in India
          </p>
        </div>
      </div>

      <FooterGoldRail />
    </footer>
  );
}