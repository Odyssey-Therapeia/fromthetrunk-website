# Final Sitemap, Robots, And Llms Report

Result: PASS for source/tests, pending final deployment and live crawl.

Included indexable surfaces:
- `/`
- `/collection`
- eligible real PDPs
- `/our-story`
- `/our-team`
- `/how-it-works`
- `/faqs`
- `/why`
- `/sell-your-saree`
- `/packing`
- `/policies`
- `/policies/[slug]`
- approved guides
- approved curated fabric/occasion pages when eligibility threshold passes

Excluded surfaces:
- cart
- checkout
- account
- admin
- api
- search
- wishlist
- arbitrary filter/query URLs
- sold products from sitemap
- draft/private products
- QA/test/placeholder products
- Rs 1 products
- Untitled products
- `/blouses` while QA-only

Route map highlights:
- `/robots.txt` points to final-domain sitemap through canonical URL helper.
- `/llms.txt` includes canonical public route list and eligible products only.
- `/sitemap.xml` filters product rows through `shouldIncludeProductInSeo`.
- Product sitemap image entries use sanitized SEO image URLs.

Tests:
- Sitemap excludes QA/test products and sold products.
- Sitemap can include a real eligible blouse fixture.
- Llms excludes QA/test products and can include real eligible blouse fixture.
- Robots disallows private/system/transactional route families.
- No blocked stock-image URLs in production-facing source/config.

Staging note:
- Staging URL was not submitted to Google.
- Final-domain submission is deferred until owner deploys current source to the custom domain.

