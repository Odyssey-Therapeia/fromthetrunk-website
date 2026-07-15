import Image from "next/image";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/analytics/cookie-settings-button";
import { WhatsAppLink } from "@/components/analytics/whatsapp-link";
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
      { href: "/contact", label: "Contact Support" },
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

const CONTACT_FOOTER_LINK = {
  href: "/contact",
  label: "Contact Support",
} as const;

function ensureContactFooterLink(
  footerSections: FooterSection[],
): FooterSection[] {
  if (
    footerSections.some((section) =>
      section.links.some((link) => link.href === CONTACT_FOOTER_LINK.href),
    )
  ) {
    return footerSections;
  }

  const targetIndex = footerSections.findIndex(
    (section) => section.title === "Customer Care",
  );
  const insertIndex = targetIndex >= 0 ? targetIndex : 0;

  return footerSections.map((section, index) =>
    index === insertIndex
      ? { ...section, links: [...section.links, CONTACT_FOOTER_LINK] }
      : section,
  );
}

type IconProps = {
  className?: string;
};

// Brand marks below use the official Simple Icons glyphs (fill = currentColor),
// so the whole social row reads as one consistent set.
function InstagramIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />
    </svg>
  );
}

function LinkedInIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FacebookIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function XIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

function ThreadsIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
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

function CompactArchLineArt() {
  return (
    <svg
      viewBox="0 0 280 300"
      className="absolute left-0 top-0 h-[220px] w-[220px] text-[#B39152]/32 sm:h-[245px] sm:w-[245px] md:h-[250px] md:w-[250px]"
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

        <rect
          width="100%"
          height="100%"
          fill="url(#ftt-compact-footer-motif)"
        />
      </svg>
    </div>
  );
}

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
              <span className="text-sm transition group-open:rotate-45">
                ＋
              </span>
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

function FooterTrunkBrand() {
  return (
    <div className="relative mx-auto h-[215px] w-full max-w-[360px] sm:h-[235px] md:mx-0 md:h-[250px] md:max-w-none xl:h-[270px] 2xl:h-[285px]">
      <CompactArchLineArt />

      <div className="absolute left-[190px] top-1/2 z-20 flex w-fit -translate-y-1/2 rounded-[22px] border border-[#B39152]/30 bg-[#FDF7F1] px-5 py-3 opacity-70 shadow-[0_14px_32px_rgba(0,0,0,0.25)] sm:left-[215px] md:left-[215px] xl:left-[240px] 2xl:left-[290px]">
        <Image
          src="/Ftt_logo_navbar.avif"
          alt="From the Trunk"
          width={176}
          height={70}
          loading="lazy"
          fetchPriority="low"
          className="h-12 w-auto object-contain xl:h-14"
        />
      </div>

      <Image
        src="/footer/ftt-trunk-saree.webp"
        alt=""
        width={520}
        height={400}
        loading="lazy"
        fetchPriority="low"
        sizes="(max-width: 639px) 300px, (max-width: 767px) 325px, (max-width: 1535px) 330px, 360px"
        className="absolute bottom-[-4px] left-1/2 z-10 w-[300px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_44px_rgba(0,0,0,0.48)] sm:w-[325px] md:left-[-30px] md:w-[315px] md:translate-x-0 xl:left-[-42px] xl:w-[330px] 2xl:left-[-60px] 2xl:w-[360px]"
      />
    </div>
  );
}

export function SiteFooter({
  footerSections = DEFAULT_FOOTER_SECTIONS,
}: {
  footerSections?: FooterSection[];
}) {
  const year = new Date().getFullYear();
  const resolvedFooterSections = ensureContactFooterLink(footerSections);

  const footerNavGridClass =
    resolvedFooterSections.length <= 3
      ? "lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3"
      : "lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4";

  return (
    <footer className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(179,145,82,0.13),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(96,29,28,0.22),transparent_34%),linear-gradient(180deg,#141D46_0%,#070A17_100%)] text-[#FDF7F1]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(253,247,241,0.025)_1px,transparent_1px)] bg-[size:96px_96px] opacity-25" />

      <div className="relative mx-auto w-full max-w-[1680px] px-5 pt-8 sm:px-6 lg:px-10 2xl:px-14">
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)_320px] 2xl:gap-6">
          <section aria-label="From The Trunk brand story visual">
            <FooterTrunkBrand />
          </section>

          <nav
            className={`hidden gap-5 md:grid md:grid-cols-2 ${footerNavGridClass}`}
            aria-label="Footer navigation"
          >
            {resolvedFooterSections.map((section) => (
              <div
                key={section.title}
                className="border-l border-[#B39152]/22 pl-5"
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

          <FooterMobileNav footerSections={resolvedFooterSections} />

          <section className="border-t border-[#B39152]/24 pt-5 lg:col-span-2 2xl:col-span-1 2xl:border-l 2xl:border-t-0 2xl:pl-7 2xl:pt-0">
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
                    href="https://www.linkedin.com/company/from-the-trunk-ftt/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Follow From the Trunk on LinkedIn"
                  >
                    <LinkedInIcon className="h-4 w-4" />
                  </a>

                  <a
                    href="https://www.facebook.com/people/From-The-Trunk/61590567961822/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Follow From the Trunk on Facebook"
                  >
                    <FacebookIcon className="h-4 w-4" />
                  </a>

                  <a
                    href="https://x.com/fromthetrunkftt"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Follow From the Trunk on X"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </a>

                  <a
                    href="https://www.threads.com/@from.thetrunk"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Follow From the Trunk on Threads"
                  >
                    <ThreadsIcon className="h-4 w-4" />
                  </a>

                  <WhatsAppLink
                    location="footer"
                    href="https://wa.me/919731910202"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="grid h-10 w-10 place-items-center rounded-full border border-[#B39152]/42 text-[#B39152] transition hover:border-[#FDF7F1]/60 hover:text-[#FDF7F1]"
                    aria-label="Chat with From the Trunk on WhatsApp"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </WhatsAppLink>

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

        {/*
          The four value cards are commented out as requested:
          - Curated with intention
          - Restored with care
          - Authentic & trusted
          - Sustainable luxury
        */}

        <div className="mt-7 grid grid-cols-1 items-center gap-3 border-t border-[#B39152]/35 py-4 text-center text-[12px] text-[#FDF7F1]/58 md:grid-cols-[1fr_auto_1fr] md:text-left">
          <p className="flex flex-col items-center gap-1 md:flex-row md:gap-3">
            <span>© {year} From The Trunk. All rights reserved.</span>
            <CookieSettingsButton className="text-[#FDF7F1]/58 underline-offset-2 transition hover:text-[#FDF7F1] hover:underline" />
          </p>

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
