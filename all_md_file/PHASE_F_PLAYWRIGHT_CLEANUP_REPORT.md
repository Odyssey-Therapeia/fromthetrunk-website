# Phase F Playwright Cleanup Report

## Goal

Make the targeted Playwright suite validate the current approved UI instead of restoring old content/layout.

## Known Stale Failures Classification

| Area | Classification | Action |
| --- | --- | --- |
| Our Story expected old Bengaluru headline/copy/cards | stale test | Updated to current story-book hero, cover copy, and contents dialog chapter list. |
| How It Works expected old five-step headings as `h2` | stale selector | Updated to current `h3` step headings and accessible animated `h1` contract. |
| Product gallery expected `lg:sticky` class | stale implementation detail | Updated to semantic product image region assertion. |
| Mobile PDP first viewport expected title/CTA in first viewport | stale UX contract | Updated to assert current mobile layout and scroll CTA into viewport. |
| Homepage brand teaser expected old copy | stale copy | Updated to current Our Story section headline. |

No visible copy was changed to satisfy tests.

## Command Result

Command:

```bash
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec playwright test --project=chromium tests/e2e/site-feedback-fixes.spec.ts tests/e2e/mobile-screenshot.spec.ts
```

Result:
- PASS, 12 passed.

Notes:
- The dev server emitted a Next warning that `/Ftt_logo_navbar.avif` can be LCP in dev-server contexts and suggests eager loading if it is above fold. Production LHCI remained dominated by route-level LCP failures and does not make this warning alone a clean launch blocker.
- Screenshot artifacts were updated under `test-results/`.
