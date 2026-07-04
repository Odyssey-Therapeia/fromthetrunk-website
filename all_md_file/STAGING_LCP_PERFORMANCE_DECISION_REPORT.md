# Staging LCP Performance Decision Report

Date: 2026-07-04

## What Improved

The shared navbar logo now uses:
- `public/Ftt_logo_navbar.avif`
- `loading="eager"`
- `fetchPriority="high"`

This addresses the previous navbar logo LCP warning without changing visible layout.

## Remaining Blocker

`agent:check` failed during public mobile LHCI LCP assertions.

Measured values:
- `/`: 5349 ms
- `/collection`: 4972 ms
- `/cart`: 4867 ms
- `/checkout`: 4892 ms
- `/our-story`: 5272 ms
- `/how-it-works`: 5729 ms
- `/policies/privacy-policy`: 4272 ms
- `/policies/terms-of-service`: 4293 ms
- `/policies/shipping-delivery-policy`: 4194 ms
- `/policies/return-refund-policy`: 4293 ms
- `/packing`: 4291 ms

Threshold: 2500 ms.

## Decision

Production cutover should still treat mobile LCP as a launch blocker unless the owner explicitly accepts the risk. The current SEO fix should still be deployed before indexing because it removes test product indexation risk.

