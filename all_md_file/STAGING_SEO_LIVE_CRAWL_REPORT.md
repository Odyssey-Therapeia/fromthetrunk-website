# Staging SEO Live Crawl Report

Date: 2026-07-04
Target: `https://fromthetrunk-website.vercel.app/`

## Fresh Crawl Findings

Live staging is still pre-fix because no deploy was performed.

| Surface | Status | Finding |
| --- | ---: | --- |
| `/sitemap.xml` | 200 | 78 URL entries, 345 image entries, includes blouse/test signals, includes `/sell-your-saree`. |
| `/robots.txt` | 200 | Sitemap directive points to the production canonical sitemap. |
| `/llms.txt` | 200 | Includes blouse/test signals before deploy. |
| `/blouses` | 200 | Currently `index, follow`; contains `Rs 1` and `Untitled Product` evidence. |
| `/collection?type=blouse` | 200 | Already `noindex, follow`; canonical is `/collection`. |
| `/faqs` | 200 | FAQPage schema present. |
| `/sell-your-saree` | 200 | FAQPage schema present. |

## Important Distinction

This report is live staging evidence before deploy. The source fix is local only until a later approved deploy.

