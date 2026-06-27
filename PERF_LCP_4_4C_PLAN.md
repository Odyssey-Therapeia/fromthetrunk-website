# PERF_LCP_4_4C_PLAN.md

Date: 2026-06-27

No source files were edited before this plan was created. This plan uses the latest public mobile Lighthouse artifacts under `test-results/lighthouse/mobile/` plus:

- `SECURITY_FIX_PHASE_4_4B_REPORT.md`
- `PERF_LCP_4_4B_DIAGNOSIS.md`
- `PERF_AUDIT.md`
- `SECURITY_FIX_PHASE_4_3_REPORT.md`
- `CSP_ENFORCEMENT_PLAN.md`

## Constraints

- Do not redesign the product experience.
- Do not change OTP expiry, auth/security policy, Razorpay signature verification, payment amount calculation, product pricing, product card visuals, reservation behavior, or order completion logic.
- Do not send live OTP emails or hit production payment endpoints.
- Keep Razorpay/payment code server-authoritative.

## Current Evidence

Latest public mobile LHCI after Phase 4.4B/contact-review work:

| Route | LCP | Current LCP element | Main root cause |
|---|---:|---|---|
| `/` | 5344 ms | Lighthouse element attribution empty | Dynamic homepage data plus global public shell/provider/header/widgets before first viewport settles. |
| `/collection` | 4820 ms | Collection banner image | Banner image load delay plus collection page/client shell work. |
| `/cart` | 5386 ms | Server cart hero paragraph | Intended content is now LCP, but render delay remains high from shared shell/runtime. |
| `/checkout` | 5764 ms | Checkout heading text | Intended content is now LCP, but render delay remains high from shared shell/runtime. |
| `/our-story` | 4748 ms | Story cover image | Full client route and image load delay. |
| `/how-it-works` | 4065 ms | H1 text | Dynamic CMS/global read and shared shell text render delay. |
| `/privacy-policy` | 4088 ms | Policy text | Shared shell text render delay on otherwise static text. |
| `/shipping-policy` | 4163 ms | Policy text | Shared shell text render delay on otherwise static text. |
| `/return-policy` | 3841 ms | Policy text | Shared shell text render delay on otherwise static text. |
| `/packing` | 3990 ms | Packing text | Shared shell text render delay on otherwise static text. |

## Architecture Plan

### 1. Remove global pre-LCP work from the public layout

Files:

- `app/(site)/layout.tsx`
- `components/providers.tsx`
- `components/widgets/site-widgets.tsx`
- `components/layout/site-header.tsx`
- `components/layout/site-header-server.tsx`

Changes:

- Stop awaiting `getLatestReel()` in the root public layout. Optional reel data must be fetched after first paint inside the deferred widget island.
- Keep the global provider surface as small as possible for this phase by deferring non-essential provider side effects, especially wishlist merge and toast/runtime-only widgets.
- Split the public header into a server-visible shell for logo/nav/first viewport and a smaller client controls island for session-aware account, search, cart, mobile menu, and connect dialog.
- Keep header visuals and product-card UI unchanged.

Expected impact:

- Lower render delay on static text routes, cart, checkout, and policy pages.
- Lower shared JS/unused JS pressure across all public mobile routes.

Rollback:

- Restore the previous client `SiteHeader` entry and pass `latestReel` from layout to `SiteWidgets`.

### 2. Make homepage and collection first viewport more deterministic

Files:

- `app/(site)/page.tsx`
- `components/sections/hero-section.tsx`
- `app/(site)/collection/page.tsx`
- `components/sections/collection-hero-carousel.tsx`

Changes:

- Remove unnecessary dynamic homepage forcing for normal public traffic where safe.
- Keep only the true above-fold hero image prioritized.
- Ensure collection banner uses one active, high-priority LCP image and inactive slides do not compete before first paint.
- Preserve collection product-card visuals and pricing logic.

Expected impact:

- Reduce homepage TTFB/route work and collection LCP image load delay.

Rollback:

- Restore dynamic homepage export and previous collection carousel mounting.

### 3. Convert route chrome pages to static-first where possible

Files:

- `app/(site)/cart/page.tsx`
- `app/(site)/checkout/page.tsx`
- `app/(site)/how-it-works/page.tsx`
- `app/(site)/our-story/page.tsx`
- policy/packing pages only if source inspection shows remaining client-only first viewport work.

Changes:

- Avoid awaiting below-fold recommendations before cart/checkout first viewport.
- Keep checkout auth/payment logic unchanged inside existing client components.
- Remove avoidable public-route dynamic flags for informational pages.
- For `/our-story`, keep a server-visible first viewport and defer heavier interactive story/book behavior so the cover/H1 can paint before client animation code.

Expected impact:

- Lower TTFB on cart/checkout/how-it-works.
- Lower our-story image/client load delay.

Rollback:

- Restore recommendation fetches in server pages and previous client-only our-story route.

### 4. Verification and reporting

Run with Node 22:

```bash
npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint
npx -y -p node@22 -p pnpm@10.28.0 pnpm run build
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false
npx -y -p node@22 -p pnpm@10.28.0 pnpm run test
npx -y -p node@22 -p pnpm@10.28.0 pnpm audit
npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check
```

If public mobile still fails, run focused public mobile LHCI and produce a formal `PERF_REBASELINE_REQUEST.md` with exact route-specific evidence.

## Release Decision Criteria

Create `SECURITY_FIX_PHASE_4_4C_REPORT.md` with:

- Changed files.
- Before/after LCP table.
- LHCI artifact paths.
- Whether public mobile passed.
- Whether `agent:check` reached public desktop and admin scopes.
- Remaining blockers.
- Final GO/NO-GO recommendation for production release candidate.

