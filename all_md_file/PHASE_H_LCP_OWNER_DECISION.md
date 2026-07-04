# Phase H LCP Owner Decision

Date: 2026-07-03
Result: NO-GO unless owner explicitly accepts risk

## Fresh Gate Result

`pnpm run agent:check` was executed through the Node 22 wrapper. The verify phase passed, but the LHCI matrix stopped at the first public mobile pass because LCP assertions failed.

Threshold: LCP <= 2500 ms.

| Route | Fresh mobile LCP |
| --- | ---: |
| `/` | 5270.064 ms |
| `/collection` | 5801.5625 ms |
| `/cart` | 4698.794750000001 ms |
| `/checkout` | 4742.361000000001 ms |
| `/our-story` | 5121.84455 ms |
| `/how-it-works` | 5652.820275000002 ms |
| `/policies/privacy-policy` | 4213.211499999999 ms |
| `/policies/terms-of-service` | 4290.61375 ms |
| `/policies/shipping-delivery-policy` | 4212.42425 ms |
| `/policies/return-refund-policy` | 4289.2392500000005 ms |
| `/packing` | 4288.342000000001 ms |

Additional LHCI warnings:

- `/cart` SEO score warning: 0.66. This is expected because cart is intentionally `noindex`.
- `/checkout` SEO score warning: 0.66. This is expected because checkout is intentionally `noindex`.

Targeted Playwright also surfaced the Next.js warning that `/Ftt_logo_navbar.avif` was detected as LCP and should be eager-loaded if above the fold.

## Decision Options

| Option | Decision | Tradeoff |
| --- | --- | --- |
| Remediate before launch | Recommended | Keeps `agent:check` launch gate meaningful and avoids known mobile performance regression. |
| Owner accepts LCP risk | Allowed only by owner | Launch can proceed later only after owner explicitly accepts the public mobile LCP miss and all other gates pass. |
| Lower/remove LHCI threshold | Not recommended | Hides the current failure instead of fixing the launch risk. |

## Launch Decision

Current LCP status is NO-GO. The mobile public LHCI failure blocks production cutover unless the owner explicitly accepts the risk after reviewing these metrics.

