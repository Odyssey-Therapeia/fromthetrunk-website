# Final Product Schema Image Policy Report

Result: PASS for source and tests, with data quality caveat for live CMS media alt cleanup.

Product JSON-LD policy:
- Real eligible products can emit Product JSON-LD.
- QA/test products are noindex and suppress Product JSON-LD.
- Sold real products may emit truthful OutOfStock Product JSON-LD when visited.
- No AggregateRating schema added.
- No Review schema added.
- Product image URLs are filtered through the SEO image sanitizer.

Image URL policy:
- Rejects non-HTTPS URLs.
- Rejects localhost and loopback URLs.
- Rejects preview deployment hosts for SEO image output.
- Rejects blocked stock-image hosts.
- Deduplicates image arrays.

Verified tests:
- Product JSON-LD includes product identifiers and truthful OutOfStock availability for sold products.
- Product JSON-LD does not emit fake ratings or reviews.
- Product JSON-LD drops blocked stock-image URLs.
- Sitemap image entries are emitted only for safe image URLs.

Caveat:
- CMS media alt cleanup remains a content backlog item. Existing product alt helper logic is in source, but full CMS metadata cleanup was not performed in this pass.

