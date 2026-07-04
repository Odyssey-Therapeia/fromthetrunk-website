# Phase E Playwright Stale Test Triage

## Command

`npx -y -p node@22 -p pnpm@10.28.0 pnpm exec playwright test --project=chromium tests/e2e/site-feedback-fixes.spec.ts tests/e2e/mobile-screenshot.spec.ts`

## Result

- 6 passed.
- 6 failed.

## Passing Coverage

- Mobile product page screenshot.
- Mobile product gallery screenshot.
- Footer social link checks.
- Light-mode-only checks.

## Failing Tests

| Test area | Failure | Classification |
| --- | --- | --- |
| Our Story headline/copy | Expected old `Born in Bengaluru` headline and older narrative text. | Stale content assertion. |
| Our Story cards | Expected `Sourcing`, `Quality Control`, `Eco-Restoration`. | Stale content assertion. |
| How It Works | Expected old 5-step process and old heading. | Stale content assertion. |
| Product gallery UX | Expected a `lg:sticky` class that is absent in current PDP layout. | Stale selector/layout contract. |
| Mobile PDP first viewport | Expected product title and CTA in first viewport; current flow has fixed bottom purchase bar and title below initial gallery. | Product UX contract needs owner decision. |
| Homepage brand teaser | Expected old `Born in Bengaluru, rooted in heritage` copy. | Stale content assertion. |

## Phase E Decision

No visible content was changed to satisfy stale tests. No product layout was changed in Phase E because the task scope was performance/load readiness and the brief forbids visible copy/media changes without approval.

## Recommended Next Step

Update or replace stale Playwright assertions after the owner confirms the current page copy/layout is the approved source of truth. The mobile PDP first-viewport expectation needs a specific UX decision, not just a selector update.

