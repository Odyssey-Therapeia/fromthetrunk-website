import Image from "next/image";
import Link from "next/link";
import type { FooterSection } from "@/components/layout/nav-data";

// Default footer sections (fallback when no managed menu is configured).
const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Explore",
    links: [
      { href: "/collection", label: "The Collection" },
      { href: "/our-story", label: "Our Story" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/sell-your-saree", label: "Sell Your Saree" },
      { href: "/guides/what-is-a-pre-loved-saree", label: "What Pre-Loved Means" },
    ],
  },
  {
    title: "Shop By",
    links: [
      { href: "/collection/fabric/silk", label: "Pre-Loved Silk Sarees" },
      { href: "/collection/occasion/festive", label: "Festive Sarees" },
      { href: "/guides/pre-loved-vs-second-hand-saree", label: "Pre-Loved vs Second-Hand" },
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

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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

export function SiteFooter({
  footerSections = DEFAULT_FOOTER_SECTIONS,
}: {
  footerSections?: FooterSection[];
}) {
  return (
    <footer className="bg-[radial-gradient(circle_at_12%_0%,rgba(179,145,82,0.16),transparent_32%),linear-gradient(135deg,#141D46_0%,#0E0D0E_100%)] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-9 px-5 py-12 sm:px-6 md:grid-cols-[1.4fr_2fr] md:gap-12 md:py-16">
        <div className="space-y-4">
          <div className="inline-flex rounded-2xl border border-white/20 bg-[#FDF7F1] px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
            <Image
              src="/Ftt_logo_navbar.png"
              alt="From the Trunk"
              width={140}
              height={56}
              className="h-12 w-auto object-contain"
            />
          </div>
          <p className="max-w-sm text-sm leading-7 text-white/62">
            A curated collection of pre-loved luxury sarees. Each piece is
            authenticated, cherished, and ready for a new story.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <a
              href="mailto:hello@fromthetrunk.shop"
              className="text-sm text-white/62 transition hover:text-white"
            >
              hello@fromthetrunk.shop
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://www.instagram.com/from.thetrunk/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/62 transition hover:border-[#B39152] hover:text-white"
              aria-label="Follow From the Trunk on Instagram"
            >
              <InstagramIcon />
              Instagram
            </a>
            <a
              href="https://wa.me/919731910202"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/62 transition hover:border-[#B39152] hover:text-white"
              aria-label="Chat with From the Trunk on WhatsApp"
            >
              <ChatIcon />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="grid gap-7 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B39152]">
                {section.title}
              </p>
              <ul className="space-y-1 text-sm text-white/62 sm:space-y-2">
                {section.links.map((link) => (
                  <li key={`${section.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="block rounded-lg py-2 transition hover:text-white hover:underline underline-offset-4 sm:py-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/62">
        © {new Date().getFullYear()} From the Trunk. All rights reserved.
      </div>
    </footer>
  );
}
