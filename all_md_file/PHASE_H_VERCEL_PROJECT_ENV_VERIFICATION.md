# Phase H Vercel Project And Env Verification

Date: 2026-07-03
Result: NO-GO

## What Was Verified

- Local `.vercel/project.json`: missing.
- Local Vercel CLI: not available.
- No Vercel env values were printed or inspected locally.
- No deploy was run.
- No env mutation was run.

## Prior Connector Evidence Carried Forward

Prior Phase G connector evidence identified a Vercel project named `fromthetrunk-website` under Odyssey Therapeia, with a production-ready deployment visible to the connector. That connector did not expose environment variables.

The connector-visible project domain list in Phase G did not prove that `www.fromthetrunk.shop` was attached to the inspected project. This remains a launch blocker because the public `www` domain is serving stale SEO assets.

## Fresh Public Evidence

Read-only fetches on 2026-07-03:

| URL | Status | Finding |
| --- | ---: | --- |
| `https://fromthetrunk-website.vercel.app/sitemap.xml` | 200 | 78 URLs, 345 image tags, includes `/sell-your-saree`, `/faqs`, `/why`, and guide routes. |
| `https://fromthetrunk-website.vercel.app/robots.txt` | 200 | Points Sitemap to `https://www.fromthetrunk.shop/sitemap.xml`. |
| `https://www.fromthetrunk.shop/sitemap.xml` | 200 | 63 URLs, 0 image tags, missing new SEO routes. |
| `https://www.fromthetrunk.shop/robots.txt` | 200 | Minimal live robots output still points to `www` sitemap. |

## Env Verification Status

| Area | Status | Reason |
| --- | --- | --- |
| Production env values | UNKNOWN | No local Vercel link/CLI access and connector did not expose values. |
| Preview env values | UNKNOWN | Same. |
| Development env values | UNKNOWN | Same. |
| Production domain ownership | UNKNOWN | `www.fromthetrunk.shop` is public but not proven attached to the inspected project. |
| Production deployment alignment | NO-GO | `www` sitemap/robots do not match current inspected preview/source. |

## Required Owner-Side Checks

- Confirm the Vercel project ID and team in the Vercel dashboard.
- Confirm `www.fromthetrunk.shop` is attached to the intended project.
- Confirm production env keys are present and scoped only to the intended environments.
- Confirm no live Razorpay key is present in preview/development unless intentionally guarded.
- Confirm durable rate-limit env (`UPSTASH_REDIS_REST_URL`/token or `KV_REST_API_URL`/token) exists in production.
- Confirm auth/NextAuth URLs and secrets are production-scoped.

