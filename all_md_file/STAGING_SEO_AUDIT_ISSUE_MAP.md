# Staging SEO Audit Issue Map

Date: 2026-07-04
Workbook: `/Users/JP/Downloads/SiteAnalysis_SocialMediaStrategy_FromTheTrunk_Analysis.xlsx`

## Summary

The workbook has 19 issue rows in the SEO sheet and 20 dashboard actions. The dashboard-only Issue 20 is the Unsplash/original photography item.

The main code fix in this pass addresses the live staging blocker where blouse QA products with `Rs 1` pricing and `Untitled Product` copy were indexable and present in SEO surfaces.

## Issue Map

| # | Workbook issue | Result after this pass | Notes |
| ---: | --- | --- | --- |
| 1 | Test/placeholder products live and indexable | Source fixed, staging pending deploy | QA blouse products are excluded from sitemap and `llms.txt`; their PDPs are `noindex, follow`; Product JSON-LD is suppressed. |
| 2 | Product schema | Improved guardrail | Real products keep Product and Offer schema. QA/test products no longer emit Product JSON-LD. No fake reviews were added. |
| 3 | Sitemap and GSC | Source improved, external pending | Sitemap excludes QA products after deploy. GSC submission was not performed. |
| 4 | Thin product content | Backlog | Test/placeholder products are protected from indexing; real content expansion remains CMS/editorial work. |
| 5 | Editorial content | Partial existing | Guide and sell pages exist. No new visible content was added. |
| 6 | GSC and GA4 | External verification | Source wiring exists, but account-side confirmation was not performed. |
| 7 | Canonical/filter SEO | Existing plus protected | Query collection filters remain `noindex, follow`; blouse landing page now force noindexes. |
| 8 | Titles | Backlog | No visible title/copy rewrite was performed. |
| 9 | Category pages | Existing partial | Fabric and occasion routes exist; full taxonomy expansion remains backlog. |
| 10 | Image alt | Existing partial | Product alt helpers exist; no visible media/copy change was made. |
| 11 | FAQ schema | Existing partial | FAQPage schema exists where visible FAQ content exists. |
| 12 | Backlinks | External | Not code-verifiable. |
| 13 | Reviews | Backlog | No fake Review or AggregateRating schema added. |
| 14 | WhatsApp/contact | Existing covered | Existing tests cover footer/contact links without printing contact values here. |
| 15 | Breadcrumb schema | Existing plus PDP retained | BreadcrumbList remains on PDPs, including noindexed QA PDPs. |
| 16 | Meta descriptions | Partial | QA product meta noindex reduces risk; content rewrites deferred. |
| 17 | Large images/Core Web Vitals | Still blocker | LCP still fails in LHCI. |
| 18 | Sell Your Saree | Existing | Route exists and remains in sitemap source. |
| 19 | Local SEO | External | Requires owner-side listing work. |
| 20 | Unsplash stock images | Evidence only | Source still references Unsplash in specific files; no replacement without owner media approval. |

