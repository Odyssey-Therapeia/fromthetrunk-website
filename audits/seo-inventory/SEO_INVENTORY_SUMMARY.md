# From The Trunk SEO Inventory Audit

Generated: 2026-07-22T15:21:16.378Z  
Audit target: fresh production build served locally at http://127.0.0.1:3100  
Method: static source scan plus server-rendered HTTP GET crawl. No external website was crawled. External outbound URLs were inventoried but not fetched.

## Executive verdict

**Not production SEO-ready: 0 Critical and 9 High issue rows require resolution or explicit acceptance.**

The audit checked 124 URLs (119 rendered HTML responses), 56 real product pages, and 650 source/config/test/asset files. It extracted 21,195 normalized SEO phrases, 2,466 corpus words, 6,315 internal link instances, and 716 outbound link instances.

## Verified counts

| Metric | Count |
|---|---:|
| Public indexable pages | 79 |
| Unexpected indexable utility/private pages | 1 |
| Noindex pages | 31 |
| Redirects | 13 |
| 404 responses | 7 |
| 5xx responses | 1 |
| Soft-404/thin risks | 0 |
| Sitemap pages represented in crawl | 75 |
| Indexable pages missing from sitemap | 4 |
| Duplicate-title pages | 0 |
| Duplicate-description pages | 0 |
| Missing H1 pages | 0 |
| Multiple-H1 pages | 0 |
| Canonical mismatches/missing | 0 |
| Pages with structured data | 117 |
| Invalid structured-data pages | 0 |
| Pages with missing image alt attributes | 0 |

## Top 10 critical/high-priority findings

1. **High - Canonical indexable page is missing from the sitemap.** (/collection/fabric/chiffon)  
   Evidence: Status 200; robots index, follow; canonical https://www.fromthetrunk.shop/collection/fabric/chiffon  
   Action: Add the route only after confirming durable content and canonical indexability.
2. **High - Canonical indexable page is missing from the sitemap.** (/collection/fabric/georgette)  
   Evidence: Status 200; robots index, follow; canonical https://www.fromthetrunk.shop/collection/fabric/georgette  
   Action: Add the route only after confirming durable content and canonical indexability.
3. **High - Utility/private/query page is indexable.** (/admin)  
   Evidence: Robots meta index, follow; X-Robots-Tag none  
   Action: Emit the intended noindex directive at page or response-header level.
4. **High - Canonical indexable page is missing from the sitemap.** (/collection/rose-vine-stripe-chiffon-saree)  
   Evidence: Status 200; robots index, follow; canonical https://www.fromthetrunk.shop/collection/rose-vine-stripe-chiffon-saree  
   Action: Add the route only after confirming durable content and canonical indexability.
5. **High - Canonical indexable page is missing from the sitemap.** (/collection/coral-sunrise-chiffon-georgette-saree)  
   Evidence: Status 200; robots index, follow; canonical https://www.fromthetrunk.shop/collection/coral-sunrise-chiffon-georgette-saree  
   Action: Add the route only after confirming durable content and canonical indexability.
6. **High - robots.txt disallows customer utility pages whose metadata intends noindex, follow.** (/account, /cart, /checkout, /search)  
   Evidence: The disallow rules can prevent crawlers from fetching the pages and observing noindex, follow.  
   Action: Allow these utility pages to be crawled while retaining noindex, follow metadata; keep admin/API protections separate.
7. **High - Primary internal links point to noindex collection query variants instead of dedicated canonical landing pages.** (Header and homepage category links)  
   Evidence: Top Viewed and Blouses use collection query URLs; homepage fabric cards also use filters while canonical landing routes exist.  
   Action: Link the relevant labels to /top-viewed, /blouses, and eligible canonical fabric/occasion landing pages.
8. **High - Some keyword pages can become indexable at the product threshold but remain permanently excluded from the sitemap.** (/collection/fabric/* and /collection/occasion/*)  
   Evidence: Metadata indexability is count-driven, while sitemap:false is checked before product counts.  
   Action: Make sitemap inclusion use the same product-count eligibility decision as metadata, with explicit route policy overrides only where intentional.
9. **High - Indexable legal pages contain unresolved bracketed business placeholders.** (/policies/*)  
   Evidence: The source flags placeholders and includes provisional grievance officer/contact/address values.  
   Action: Replace every placeholder with approved legal entity, jurisdiction, officer, contact, hours, and address details before launch.
10. **Medium - Static, policy, and keyword sitemap lastmod values use one synthetic 2026-04-27 date.** (/policies/* and static pages)  
   Evidence: Rendered policies display later effective dates, including June 29, 2026.  
   Action: Derive lastmod from maintained content timestamps or a route-specific audited constant.

## Top 10 quick wins

1. Add the route only after confirming durable content and canonical indexability.
2. Emit the intended noindex directive at page or response-header level.
3. Allow these utility pages to be crawled while retaining noindex, follow metadata; keep admin/API protections separate.
4. Link the relevant labels to /top-viewed, /blouses, and eligible canonical fabric/occasion landing pages.
5. Make sitemap inclusion use the same product-count eligibility decision as metadata, with explicit route policy overrides only where intentional.
6. Replace every placeholder with approved legal entity, jurisdiction, officer, contact, hours, and address details before launch.
7. Derive lastmod from maintained content timestamps or a route-specific audited constant.
8. Verify preview response headers live and make draft-mode noindex, nofollow explicit if not already enforced upstream.
9. Apply a data threshold or render durable editorial content sufficient for an indexable landing page.
10. Review for a unique, factual description around 120-155 characters; do not keyword-stuff.

## PDF source-of-truth compliance

The current three-page PDF is the newest named source of truth. 4 mapped rows are Partial or Missing in rendered output. See 'csv/20-pdf-sot-compliance.csv' for exact H1/title/meta/robots comparisons. Rendered production HTML is treated as the current implementation truth; PDF mappings include '/about' -> '/our-story' and policy intents -> '/policies/[slug]'.

## Historical ZIP/helper coverage

No ZIP is present in the current worktree or attachment. A deleted historical 'Archive.zip' blob was inspected read-only from Git history. It contains reports/CSVs, not implementation helpers. Its recommendations are compared in 'csv/21-zip-seo-helper-coverage.csv'; no '/journal' recommendation or Google verification item exists in that archive.

## Backlinks

Backlink data not available from project code. Requires Google Search Console Links export, Ahrefs, Semrush, or another backlink source.

Outbound external links are separately inventoried; they are not backlinks and were not fetched.

## Business decisions required before production

- /policies/*: Replace every placeholder with approved legal entity, jurisdiction, officer, contact, hours, and address details before launch.
- Sold product PDPs: Choose and document a sold-product retention policy, then reuse one eligibility function across metadata, sitemap, and llms.txt.
- /top-viewed: Apply a data threshold or render durable editorial content sufficient for an indexable landing page.
- Sitewide Organization schema: After ownership verification, align Organization sameAs with approved official profiles.
- /our-team: Choose the intended scope (team or founders) and align route copy and metadata after editorial approval.

## Validation and limitations

- 'pnpm test': passed (151 files, 1,798 tests).
- 'pnpm lint': passed.
- 'pnpm exec tsc --noEmit': passed.
- Fresh 'BEHOLD_FEED_URL=YOUR_FEED_ID pnpm build': passed; 54 app paths reported.
- Runtime Node was v25.4.0, outside the repository's declared >=20.9 <25 range; CI pins Node 22. Re-run the final gate under Node 22 before release.
- The full 'agent:check' admin Lighthouse matrix requires 'FTT_LHCI_AUTH_EMAIL' and 'FTT_LHCI_AUTH_PASSWORD', which were unavailable. The audit performs a broader metadata crawl but does not substitute for authenticated Lighthouse.
- A database-managed redirect '/collection' -> '/neel' exists, but proxy source excludes '/collection' from managed redirect consultation, so it is inert in the rendered route.
- The configured CMS contains one draft page ('/georgetta-saree') and no published CMS catch-all page; the draft was not fetched as public content.
- No Search Console/Ahrefs/Semrush backlink export was present.
- XLSX generation was blocked because the required artifact-tool runtime/loader was unavailable. The complete 24-sheet-equivalent CSV fallback is in 'csv/' and mapped by 'CSV_MANIFEST.md'.
