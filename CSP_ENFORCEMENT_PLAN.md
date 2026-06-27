# CSP Enforcement Plan

Status: report-only remains active. Do not switch to enforcing CSP until the live Razorpay and analytics smoke tests below pass with no material reports.

## Current Report-Only Policy

Defined in `next.config.ts` as `Content-Security-Policy-Report-Only` with `report-uri /api/csp-report`.

Allowed domains currently required:

- `self`
- Razorpay: `https://checkout.razorpay.com`, `https://api.razorpay.com`
- Google analytics/tag manager: `https://www.googletagmanager.com`, `https://www.google-analytics.com`, `https://analytics.google.com`, `https://region1.google-analytics.com`
- Vercel Blob images: `https://*.public.blob.vercel-storage.com`
- Catalog/social images: `https://images.unsplash.com`, `https://plus.unsplash.com`, `https://behold.pictures`, `https://*.behold.pictures`, `https://*.cdninstagram.com`
- Geo lookup/maps: `https://photon.komoot.io`, `https://*.tile.openstreetmap.org`
- `data:` and `blob:` for images/fonts/workers where currently required

## Inline Script And Style Pressure Points

Inline scripts:

- Organization JSON-LD in `app/(site)/layout.tsx`
- Product and breadcrumb JSON-LD in `app/(site)/collection/[slug]/page.tsx`
- FAQ JSON-LD in `app/(site)/faqs/page.tsx`
- CMS FAQ block JSON-LD in `lib/content/blocks/faq.tsx`

Inline styles:

- DB theme CSS in `components/layout/theme-styler.tsx`
- Sanitized CMS rich content renders in `lib/content/blocks/rich-text.tsx` and related blocks
- Razorpay checkout may inject styles/scripts inside its checkout frame

## Nonce/Hash Strategy

1. Keep `script-src 'unsafe-inline'` only while report-only data is being collected.
2. Add a per-request nonce in middleware or root layout and pass it to every first-party inline `<script>` block.
3. Replace JSON-LD inline script usage with nonce-bearing script tags. Continue using `safeJsonLd()` to prevent `</script>` injection.
4. For stable, build-time JSON-LD that cannot receive a nonce, use a SHA-256 hash. Prefer nonce for dynamic product/order/content data.
5. For theme CSS, move DB theme tokens to a nonce-bearing `<style>` tag or a first-party CSS endpoint keyed by theme version. Do not keep unrestricted `style-src 'unsafe-inline'` in enforced mode.
6. Keep third-party Razorpay checkout isolated to its documented script/frame/connect domains. Do not broaden to `https:` globally.

## Razorpay Requirements

Before enforcement:

- Test checkout modal loads from `https://checkout.razorpay.com/v1/checkout.js`.
- Confirm checkout frame is allowed by `frame-src`.
- Confirm API calls and any callback/status calls are allowed by `connect-src`.
- Confirm failure and success callbacks still verify signatures server-side.

## Analytics And Map Requirements

Before enforcement:

- Confirm GA4 measurement protocol and browser collection still send.
- Confirm GTM script loads if configured.
- Confirm Vercel Analytics and Speed Insights do not emit blocked reports in target deployment.
- Confirm Photon autocomplete and OpenStreetMap tiles load only on checkout address/map surfaces.

## Timeline

1. Staging deploy with current report-only policy.
2. Manually exercise account OTP, wishlist OTP dialog, checkout OTP gate, Razorpay test success/failure, receipt download, product pages, FAQ page, and map/autocomplete.
3. Review `/api/csp-report` server logs and browser console reports.
4. Add nonce plumbing and remove first-party inline script/style dependency.
5. Repeat staging smoke tests.
6. Switch from `Content-Security-Policy-Report-Only` to enforcing `Content-Security-Policy` only after Razorpay, analytics, JSON-LD, theme styling, and maps pass.
