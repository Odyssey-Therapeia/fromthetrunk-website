# Phase E Mobile LCP Trace Audit

## Method

Ran mobile LHCI locally against a production build through `next start`.

Primary final artifact directory:

- `test-results/lighthouse/mobile`

`agent:check` wrote 11 public mobile reports and failed before desktop/admin stages.

## Agent Check Public Mobile Results

| Route | Perf | LCP ms | FCP ms | TBT ms | CLS | LCP candidate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| / | 79 | 5341 | 1206 | 100 | 0.0004 | not reported by LH |
| /collection | 78 | 4818 | 1355 | 49 | 0.0004 | collection banner image |
| /cart | 83 | 4697 | 1206 | 6 | 0.0004 | hero paragraph text |
| /checkout | 83 | 4749 | 1205 | 13 | 0.0004 | hero heading text |
| /our-story | 76 | 5116 | 1205 | 12 | 0.0005 | story image |
| /how-it-works | 79 | 5360 | 1206 | 38 | 0.0004 | hero paragraph text |
| /policies/privacy-policy | 85 | 4347 | 1206 | 30 | 0.0004 | policy body text |
| /policies/terms-of-service | 86 | 4216 | 1206 | 13 | 0.0004 | policy body text |
| /policies/shipping-delivery-policy | 86 | 4213 | 1205 | 10 | 0.0004 | policy body text |
| /policies/return-refund-policy | 86 | 4137 | 1205 | 11 | 0.0004 | policy body text |
| /packing | 85 | 4288 | 1205 | 9 | 0.0004 | policy-like body text |

## Findings

- Public mobile LCP is not launch-green. Every tested public route exceeded the 2500 ms assertion.
- TBT is low on most routes and CLS is effectively clean, so this is not primarily a layout-shift or broad main-thread-blocking failure.
- Several pages report text as the LCP candidate, pointing to font/CSS/render timing and local throttling rather than only image byte size.
- `/collection` and `/our-story` have image LCP candidates and remain above threshold.
- `/collection` showed high local TTFB in the final LHCI run; dynamic catalog data and local environment variability should be separated from production edge behavior before launch.

## Classification

NO-GO for production launch on mobile LCP until public mobile LHCI meets the configured threshold or the threshold/measurement policy is intentionally revised and approved.

