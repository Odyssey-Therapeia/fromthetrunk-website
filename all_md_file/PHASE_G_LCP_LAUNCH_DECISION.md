# Phase G LCP Launch Decision

Date: 2026-07-03
Decision: NO-GO unless the owner explicitly accepts the documented LCP risk or changes the LCP release policy.

## Current Gate Result

`npm run agent:check` was executed through the project-compatible Node 22/pnpm 10 wrapper:

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check
```

Result: FAIL during public mobile LHCI.

The command completed `verify` first:

- Unit tests: PASS (`144` files, `1745` tests).
- Lint: PASS.
- Production build: PASS.

It then failed the public mobile LHCI LCP assertion on every audited route.

## Current Mobile LHCI Metrics

Threshold: LCP must be `<= 2500ms`.

| Route | Perf | SEO | LCP ms | FCP ms | TBT ms | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 80 | 100 | 5344 | 1205 | 36 | 0.0004 |
| `/collection` | 81 | 100 | 5196 | 1356 | 43 | 0.0004 |
| `/cart` | 83 | 66 | 4718 | 1204 | 4 | 0.0004 |
| `/checkout` | 83 | 66 | 4742 | 1205 | 4 | 0.0004 |
| `/our-story` | 81 | 100 | 5111 | 1205 | 3 | 0.0005 |
| `/how-it-works` | 78 | 100 | 5718 | 1205 | 42 | 0.0004 |
| `/policies/privacy-policy` | 85 | 100 | 4288 | 1205 | 5 | 0.0004 |
| `/policies/terms-of-service` | 86 | 100 | 4214 | 1206 | 4 | 0.0004 |
| `/policies/shipping-delivery-policy` | 85 | 100 | 4289 | 1206 | 3 | 0.0004 |
| `/policies/return-refund-policy` | 85 | 100 | 4287 | 1205 | 4 | 0.0004 |
| `/packing` | 85 | 100 | 4288 | 1205 | 4 | 0.0004 |

## Additional LCP Evidence

The targeted Playwright run passed, but the dev server repeatedly emitted this Next.js LCP hint:

```text
Image with src "/Ftt_logo_navbar.avif" was detected as the Largest Contentful Paint (LCP). Please add the `loading="eager"` property if this image is above the fold.
```

This is not, by itself, enough to prove the full LCP root cause, but it is actionable evidence to review during the next remediation pass.

## Required Owner Decision

The owner must choose one of:

| Option | Meaning | Current status |
| --- | --- | --- |
| A | Continue remediation until public mobile LCP is green. | Not selected. |
| B | Rebaseline or change release policy with explicit acceptance criteria. | Not selected. |
| C | Accept LCP launch risk. | Not selected. |

If option C is selected, use this exact release note:

> Public mobile LCP remains above the 2.5s target across audited routes. We accept this as a launch risk and will prioritize post-launch remediation.

## Launch Classification

Without owner risk acceptance or a policy rebaseline, this is a NO-GO blocker.

Even with owner LCP risk acceptance, the launch would not become a clean GO because production env, production DDL, deployed auth/cookie validation, and live SEO deployment alignment are still unresolved.
