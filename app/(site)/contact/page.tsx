import type { Metadata } from "next";
import { Instagram, Mail, MessageCircle } from "lucide-react";

import { WhatsAppLink } from "@/components/analytics/whatsapp-link";
import { ContactWizard } from "@/components/contact/contact-wizard";
import { CONTACT_TOPIC_OPTIONS } from "@/lib/contact/contact-form";
import { whatsappLink } from "@/lib/config/site";
import { contactPageJsonLd, safeJsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";

const CONTACT_EMAIL = "hello@fromthetrunk.shop";
const INSTAGRAM_URL = "https://www.instagram.com/from.thetrunk/";

const contactDescription =
  "Contact From The Trunk for authenticated pre-loved sarees, order support, selling heirloom sarees, WhatsApp help, and customer care in India.";

const contactLinks = [
  {
    href: `mailto:${CONTACT_EMAIL}`,
    label: "Email",
    value: CONTACT_EMAIL,
    Icon: Mail,
  },
  {
    href: whatsappLink(),
    label: "WhatsApp",
    value: "Start a WhatsApp chat",
    Icon: MessageCircle,
  },
  {
    href: INSTAGRAM_URL,
    label: "Instagram",
    value: "@from.thetrunk",
    Icon: Instagram,
  },
] as const;

export const metadata: Metadata = publicPageMetadata({
  title: "Contact From The Trunk | Pre-Loved Saree Support",
  description: contactDescription,
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="bg-[#FDF7F1] text-[#141D46]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(contactPageJsonLd()),
        }}
      />

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:py-24">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B]">
            From The Trunk Support
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-[clamp(3rem,9vw,6.5rem)] leading-[0.94] text-[#601D1C]">
            Contact From The Trunk
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[#141D46]/72 sm:text-lg">
            {contactDescription}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {contactLinks.map(({ href, label, value, Icon }) => {
              const isWhatsApp = /wa\.me/.test(href);
              const anchorClassName =
                "group flex min-h-20 items-center gap-4 rounded-2xl border border-[#601D1C]/10 bg-[#FFFCF8] p-4 shadow-[0_14px_36px_rgba(20,29,70,0.08)] transition hover:border-[#B39152]/70 hover:shadow-[0_18px_42px_rgba(20,29,70,0.12)]";
              const inner = (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#141D46] text-[#B39152] transition group-hover:bg-[#601D1C]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#74531B]">
                      {label}
                    </span>
                    <span className="mt-1 block break-words text-sm font-medium text-[#141D46]">
                      {value}
                    </span>
                  </span>
                </>
              );
              const target = href.startsWith("http") ? "_blank" : undefined;
              const rel = href.startsWith("http")
                ? "noreferrer noopener"
                : undefined;

              return isWhatsApp ? (
                <WhatsAppLink
                  key={label}
                  location="contact_page"
                  href={href}
                  target={target}
                  rel={rel}
                  className={anchorClassName}
                >
                  {inner}
                </WhatsAppLink>
              ) : (
                <a
                  key={label}
                  href={href}
                  target={target}
                  rel={rel}
                  className={anchorClassName}
                >
                  {inner}
                </a>
              );
            })}
          </div>

          <section className="mt-10" aria-labelledby="contact-support-topics">
            <p
              id="contact-support-topics"
              className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#74531B]"
            >
              We can help with
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {CONTACT_TOPIC_OPTIONS.map((topic) => (
                <li
                  key={topic.value}
                  className="rounded-full border border-[#B39152]/35 bg-[#FFFCF8] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#601D1C]"
                >
                  {topic.value}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section
          aria-label="Contact form"
          className="min-w-0 rounded-[1.75rem] border border-[#B39152]/22 bg-[#FFFCF8] p-4 shadow-[0_22px_60px_rgba(20,29,70,0.12)] sm:p-6 md:p-8"
        >
          <ContactWizard
            surface="landing"
            className="mx-auto w-full max-w-xl rounded-[1.5rem] border border-[#601D1C]/10 bg-[#FDF7F1] p-5 text-[#141D46] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:p-6 md:p-8"
          />
        </section>
      </section>
    </div>
  );
}
