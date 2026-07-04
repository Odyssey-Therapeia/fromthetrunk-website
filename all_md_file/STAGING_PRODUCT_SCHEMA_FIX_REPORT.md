# Staging Product Schema Fix Report

Date: 2026-07-04

## Before

Staging QA blouse PDPs emitted Product JSON-LD even though they had `Rs 1` pricing and `Untitled Product` copy.

## Fix

`app/(site)/collection/[slug]/page.tsx` now:
- Uses `productSeoRobots(product)` in metadata.
- Uses `shouldEmitProductJsonLd(product)` before emitting Product JSON-LD.
- Still emits BreadcrumbList JSON-LD for navigational context.

Sold real products remain eligible for truthful Product JSON-LD with OutOfStock availability when their PDP is visited. QA/test-like products are the ones suppressed.

## Review And Rating Policy

No fake `Review`, `reviews`, or `AggregateRating` schema was added. Product schema remains truthful.

## Test Coverage

Added and updated tests covering:
- QA/test products do not emit into sitemap.
- Product SEO policy noindexes placeholder and one-rupee products.
- Existing product JSON-LD does not add fake review/rating schema.
