# Phase F LCP Policy Decision

Status: mobile LCP remains NO-GO under the current strict LHCI policy.

## Phase E Evidence Used

- FCP around 1205-1355 ms.
- LCP around 4137-5360 ms.
- TBT low.
- CLS near zero.
- Text LCP on cart, checkout, how-it-works, policies, packing.
- Image LCP on collection and our-story.
- `agent:check` failed all public mobile routes.
- Cart/checkout are noindex transactional pages but included in the public LHCI set.

## Phase F Decision

Option A was attempted first: safe remediation without content, product media, checkout, auth, payment, or DB behavior changes.

Safe remediation did not bring public mobile LCP under 2500 ms. Post-fix `agent:check` still failed all 11 public mobile routes on LCP.

## Policy Options Still Available

Option A - Continue strict LCP remediation:
- Required for clean production GO.
- Likely requires deeper design/media/runtime work, not just safe hints.
- Product media replacement or hero asset swaps require owner visual approval.

Option B - Rebaseline LHCI policy:
- Owner can approve route-family thresholds if production field data or PSI proves local LHCI throttling is too strict.
- Suggested families:
  - public SEO routes
  - transactional noindex routes
  - static text routes
  - image-heavy collection/PDP routes

Option C - Launch with accepted LCP risk:
- Required text if accepted:

> Public mobile LCP remains above the 2.5s target across audited routes. We accept this as a launch risk and will prioritize post-launch remediation.

This cannot be called clean GO.

## Recommendation

Current recommendation: NO-GO for clean production launch. Owner must either approve deeper visual/media/performance work, approve a route-family rebaseline, or explicitly accept the LCP launch risk.
