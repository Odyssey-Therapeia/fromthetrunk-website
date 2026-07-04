# Phase E Global Render Delay Report

## Evidence

Across the final public mobile LHCI matrix:

- FCP was consistently around 1205 to 1355 ms.
- LCP was around 4137 to 5360 ms.
- TBT stayed low, mostly under 50 ms except homepage at 100 ms.
- CLS stayed around 0.0004 to 0.0005.
- Text elements were the LCP candidate on cart, checkout, how-it-works, policy pages, and packing.
- Image elements were the LCP candidate on collection and our-story.

## Interpretation

The gap between FCP and LCP is broad and route-global. Because several LCP candidates are text and TBT is low, the immediate blocker is not a single JavaScript long task. The likely launch work is a combination of:

- Critical CSS/font/render path review.
- Server response variability for dynamic routes.
- Route-specific image LCP tuning for collection, PDP, and our-story.
- Reducing non-critical below-fold media discovery where possible.

## Render-Blocking Clues

Lighthouse identified CSS chunks as render-blocking resources in detailed route inspection. It also reported that font display behavior is configured well, so the issue is not a missing `font-display` setting alone.

## Safe Changes Made

Only the decorative footer image `sizes` contract was changed. This reduces over-large image candidate selection but does not resolve global LCP.

## Launch Classification

NO-GO until mobile LCP improves across the public route set or an explicit launch exception is approved.

