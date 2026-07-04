# Final Blouse SEO Policy Refinement Report

Result: PASS for policy behavior.

Problem fixed:
- The prior source policy excluded blouse products by type.
- That would have blocked future real blouse inventory from SEO surfaces.

Implementation:
- `lib/seo/product-indexing.ts` now separates:
  - `isQaTestProduct(product)`
  - `isSeoEligibleProduct(product)`
  - `shouldIncludeProductInSeo(product)`
  - `shouldEmitProductJsonLd(product)`
- Blouse type is no longer a blanket SEO exclusion.

Current QA/test exclusion rules:
- Price at or below the test threshold.
- Placeholder text such as untitled product, test, testing, dummy, placeholder, or lorem in product text.
- Non-published status.
- Explicit QA/test/exclude metadata flags when present.
- Missing required SEO launch fields such as usable slug, product name, or real price.

Behavior:
- Current Rs 1 / Untitled / test-like blouse products remain excluded from sitemap, llms, and Product JSON-LD.
- A future published real blouse with a real name, slug, content, safe images, and price above the test threshold can be SEO eligible.
- `/blouses` remains noindex while current blouse inventory is QA/test-like and until owner approves indexing.

Tests:
- Rs 1 blouse excluded.
- Untitled blouse excluded.
- Test/placeholder blouse excluded.
- Real Rs 999 blouse eligible.
- Sitemap and llms can include eligible real blouse fixture while excluding QA blouse fixture.

