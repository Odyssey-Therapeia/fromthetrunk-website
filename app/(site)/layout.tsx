import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AnalyticsGate } from "@/components/analytics/analytics-gate";
import { ConsentBootstrapScript } from "@/components/analytics/consent-bootstrap-script";

import "../globals.css";
import { SiteFooterServer } from "@/components/layout/site-footer-server";
import { SiteHeaderServer } from "@/components/layout/site-header-server";
import { ThemeStyler } from "@/components/layout/theme-styler";
import { GlobalToaster } from "@/components/global-toaster";
import { SiteWidgets } from "@/components/widgets/site-widgets";
import { DrapeRoomPortalHost } from "@/components/drape-room/drape-room-portal-host";
import {
  organizationJsonLd,
  safeJsonLd,
  websiteJsonLd,
} from "@/lib/seo/json-ld";
import { getSiteOrigin } from "@/lib/config/site";
import {
  DEFAULT_TWITTER_CARD,
  OG_LOCALE,
  SITE_NAME,
  seoImageMetadata,
} from "@/lib/seo/metadata";

const baseUrl = getSiteOrigin();
const defaultSocialImage = seoImageMetadata();
const isVercelRuntime = process.env.VERCEL === "1";

export const metadata: Metadata = {
  title: {
    default: "From The Trunk | Authenticated Pre-Loved Sarees in India",
    template: "%s | From The Trunk",
  },
  description:
    "Shop curated pre-loved sarees, heirloom silk sarees, designer drapes, and restored Indian textiles authenticated by From The Trunk.",
  metadataBase: new URL(baseUrl),
  openGraph: {
    type: "website",
    locale: OG_LOCALE,
    siteName: SITE_NAME,
    url: baseUrl,
    title: "From The Trunk | Authenticated Pre-Loved Sarees in India",
    description:
      "Shop curated pre-loved sarees, heirloom silk sarees, designer drapes, and restored Indian textiles authenticated by From The Trunk.",
    images: [defaultSocialImage],
  },
  twitter: {
    card: DEFAULT_TWITTER_CARD,
    title: "From The Trunk | Authenticated Pre-Loved Sarees in India",
    description:
      "Shop curated pre-loved sarees, heirloom silk sarees, designer drapes, and restored Indian textiles authenticated by From The Trunk.",
    images: [defaultSocialImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "theme-color": "#4b2626",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <ConsentBootstrapScript />
        {/* P3-07: Inject active theme tokens as :root CSS custom-property overrides.
            When no theme is saved, ThemeStyler returns null and globals.css defaults apply. */}
        <ThemeStyler />
      </head>
      <body
        className="bg-background font-sans text-foreground"
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(organizationJsonLd()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(websiteJsonLd()),
          }}
        />
        {/* Skip to content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-primary focus:px-6 focus:py-3 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SiteHeaderServer />
        <main id="main-content" className="min-h-[70vh]" role="main">
          {children}
        </main>
        <SiteFooterServer />
        <SiteWidgets />
        <DrapeRoomPortalHost
          enabledHint={process.env.FTT_TRYON_ENABLED === "true"}
        />
        <GlobalToaster />
        {isVercelRuntime ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
        {/* Consent-gated Google Tag Manager + GA4 (GA4 is configured inside the
            GTM container). Loads nothing unless NEXT_PUBLIC_GTM_ID is set AND
            the visitor accepts analytics consent. */}
        <AnalyticsGate />
      </body>
    </html>
  );
}
