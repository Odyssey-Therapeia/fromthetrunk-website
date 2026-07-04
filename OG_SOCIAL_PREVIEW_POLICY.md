# FTT Open Graph and Social Preview Policy

## Global Defaults

- Site name: `From the Trunk`
- Locale: `en_IN`
- Default OG type: `website`
- Default Twitter/X card: `summary_large_image`
- Default social image: owned local FTT collection image at `/banner/collection_banner.png`
- Default social image dimensions: `1920x1080`
- Default social image alt: `From the Trunk curated pre-loved luxury saree collection`

## Homepage

- Use brand title and description.
- Use a brand/collection-safe social image.
- Canonical and OG URL must resolve to the final production domain in production mode.

## Collection

- Use authenticated pre-loved saree collection title/description.
- Use the approved collection social image.
- Filtered/query collection URLs should remain `noindex, follow`.

## PDPs

Eligible real products:
- Use product-specific title.
- Use product-specific description.
- Use product image as OG/Twitter image when the image URL passes the safe-image policy.
- Include product image alt from media alt where available; otherwise use the existing PDP gallery alt helper.
- Include product image width/height only when source media dimensions are available.
- Fall back to approved brand/collection image if the product image URL is unsafe.
- Do not add fake rating, fake review, or fake aggregate rating metadata.

Sold real products:
- May keep truthful product-specific metadata if SEO-eligible.
- Should not be included in sitemap/LLMS if existing crawl policy excludes sold products.

QA/test/placeholder products:
- Must be `noindex, follow`.
- Must suppress Product JSON-LD.
- Must not be included in sitemap/LLMS.
- Must not produce promotional product OG/Twitter metadata.
- Must use generic brand-safe noindex metadata if directly opened.

## Blouses

- `/blouses` remains `noindex, follow` while blouse inventory is QA-only.
- Future real blouse products can receive real product-specific OG metadata only when SEO-eligible.

## Guides, FAQ, Sell, Story, Team, Support Pages

- Must have page-specific title and description.
- Must include Open Graph and Twitter metadata.
- Must include safe HTTPS social image URLs.
- Must include image alt, and dimensions where the chosen owned/local asset dimensions are known.

## Policies

- Use simple policy title and description.
- Use brand/support-safe social image.
- Do not expose private support details in metadata beyond public site-level branding.

## Social Image Rules

- No Unsplash or stock image URLs.
- No localhost URLs.
- No 127.0.0.1 URLs.
- No `.vercel.app` URLs in final-domain mode.
- All OG/Twitter images must be HTTPS.
- All default/page images should include width, height, and alt.
- Product images should include width/height only when source media dimensions are known.
- No SVG as primary OG image unless owner-approved and tested.
- Prefer owner-approved 1200x630 JPG/PNG assets for maximum social crawler compatibility.
- Product images must preserve product representation and must not be recolored or replaced for this task.

## Readiness Standard

OG/social readiness is GO only when:
- Major public pages have OG/Twitter metadata.
- PDPs use safe product-specific previews where eligible.
- QA/test products are not promoted.
- `/blouses` is noindex/non-promotional while QA-only.
- No Unsplash/stock URLs are used.
- No localhost/127 URLs are used.
- No fake review/rating claims are added.
- OG images are safe, owned/local or owned product media, and appropriate.
- Lint, typecheck, build, test, audit, and diff checks pass.
