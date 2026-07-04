# Staging SEO Full Fix Final Report

Date: 2026-07-04
Target staging: `https://fromthetrunk-website.vercel.app/`

## Completed

- Added shared SEO product-indexing policy in `lib/seo/product-indexing.ts`.
- Excluded QA/test products from `app/sitemap.ts`.
- Excluded QA/test products from `app/llms.txt/route.ts`.
- Added PDP `noindex, follow` metadata for QA/test products.
- Suppressed Product JSON-LD for QA/test products.
- Kept BreadcrumbList JSON-LD on PDPs.
- Forced `/blouses` to `noindex, follow` while keeping the page usable for staging QA.
- Switched the shared header logo to AVIF and marked it eager/high priority.
- Added unit tests for sitemap, `llms.txt`, blouse landing noindex, product SEO policy, and image loading.
- Stabilized the account-session Playwright navigation helper against one Chromium `net::ERR_ABORTED` retry.
- Created the requested report set.

## Not Done By Contract

- No deploy or push.
- No sitemap submission or indexing request.
- No CMS/product price/stock/content mutation.
- No checkout/payment/cart/order/auth logic change.
- No customer notification.
- No media deletion.
- No fake review or rating schema.

## Validation

Passed:
- `pnpm run lint`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run build`
- `pnpm run test` with 144 test files and 1748 tests passing.
- `pnpm audit --audit-level moderate`
- `git diff --check`
- Targeted Playwright: 16 passed.

Failed:
- `pnpm run agent:check` failed during public mobile LHCI due to LCP values above 2500 ms.

## Final Status

SEO test-product leakage is fixed in source and ready for a controlled staging deploy. Production readiness is still blocked by mobile LCP unless accepted by the owner.

