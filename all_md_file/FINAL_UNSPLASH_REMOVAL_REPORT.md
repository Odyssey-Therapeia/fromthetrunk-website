# Final Unsplash Removal Report

Result: PASS for production-facing source/config.

What changed:
- Removed stock image hosts from `next.config.ts` image remote patterns.
- Removed stock image hosts from `next.config.ts` CSP `img-src`.
- Replaced the active brand story image source with `/footer/ftt-trunk-saree.webp`.
- Replaced story narrative fallback image with `/footer/ftt-trunk-saree.webp`.
- Replaced legacy `lib/data/sarees.ts` demo/fallback image URLs with existing local FTT media paths.
- Added SEO image sanitizer coverage so blocked stock-image hosts do not emit in sitemap or Product JSON-LD images.

Verification:
- `rg -n "unsplash|images\\.unsplash\\.com|plus\\.unsplash\\.com" app components lib db public next.config.ts`: PASS, no production-facing matches.
- `tests/unit/seo-image-optimization.test.ts`: PASS in targeted run.
- `tests/unit/seo-production-hardening.test.ts`: PASS in targeted run.

Non-production references:
- Unit tests still contain blocked URL examples to prove sanitizer behavior.
- Reports mention the removed dependency as audit evidence.

Layout/copy:
- No visible copy changed.
- No section layout changed.
- No product image crop, color, lighting, framing, or representation changed.

