# Final Staging SEO Hardening Report

Final status: STAGING SEO PARTIALLY READY — FIX CRITICAL ITEMS FIRST

Target staging URL: https://fromthetrunk-website.vercel.app/

Executive summary:
- Unsplash/stock image dependencies were removed from production-facing source/config.
- Current QA/test blouse products remain SEO-invisible.
- Future real blouse products can become SEO-eligible.
- Product schema, sitemap, robots, llms, canonical/filter, internal linking, and image policy tests pass.
- LCP remains above the 2.5s policy threshold and blocks final readiness unless owner accepts the risk.

What was fixed:
- Removed stock-image hosts from Next image config and CSP.
- Replaced active story/fallback stock images with local FTT media.
- Replaced legacy demo/fallback dataset stock URLs with local media.
- Added defensive SEO image URL filtering.
- Reworked product indexing from blouse-type exclusion to QA/test eligibility policy.
- Added tests for real blouse eligibility, QA blouse exclusion, stock-image blocking, sitemap images, llms, and Product JSON-LD filtering.

What was intentionally not changed:
- No visible copy changes.
- No layout redesign.
- No checkout/payment/Razorpay/auth/OTP/cart reservation/order/wishlist changes.
- No product price/stock/business-rule changes.
- No DB schema/migration changes in this pass.
- No asset deletion.
- No fake review/rating schema.
- No GSC submission or deploy.

Command results:
- `pnpm run lint`: PASS.
- `pnpm exec tsc --noEmit --pretty false`: PASS.
- `pnpm run build`: PASS, with existing local canonical fallback warnings.
- `pnpm run test`: PASS, 144 files and 1750 tests.
- `pnpm audit --audit-level moderate`: PASS, no known vulnerabilities.
- `git diff --check`: PASS.
- Targeted Playwright: PASS, 16 tests.
- Targeted SEO unit tests: PASS, 31 tests.
- `pnpm run agent:check`: FAIL, mobile LCP assertions.

Remaining blockers:
- Mobile LCP fails on the public LHCI batch, roughly 4.1s to 5.7s across audited routes.
- `agent:check` halts before desktop/admin LHCI due to the public mobile LCP failure.

Owner approval items:
- Visual approval for local replacement image choices.
- Approval before deleting or moving any large assets.
- Approval before indexing `/blouses`.
- Owner acceptance required if launching with current LCP risk.
