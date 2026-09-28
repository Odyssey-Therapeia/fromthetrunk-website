# Journal

The Journal (`/journal`) is the site's blog. Each article is one JSON file in the repo. There is no CMS: to publish, add a file, commit it and deploy. Pages are built statically at build time.

## Where things live

| What | Where |
| --- | --- |
| Articles | `content/journal/<slug>.json` |
| Images | `public/journal/<slug>/`; supplied photographs at `public/blog1a.avif` and `public/blog1b.avif` |
| Schema and validation | `lib/journal/schema.ts` |
| Loader (server only) | `lib/journal/articles.ts` |
| Index page | `app/(site)/journal/page.tsx` |
| Article page | `app/(site)/journal/[slug]/page.tsx` |
| Components | `components/journal/` |
| Nav and footer label | `JOURNAL_LABEL` in `lib/journal/constants.ts` |

To rename the section (for example to "Blogs"), change `JOURNAL_LABEL`. The header, the mobile menu, the footer, the breadcrumb and the index eyebrow all read it. The URL stays `/journal`.

## Validation

Every file is validated with zod when the site builds. A missing field, a misspelt key, a bad date or unbalanced markup fails `next build` with the file name and the field, for example:

```text
Invalid journal article content/journal/caring-for-silk.json:
  - body[3].text: Unclosed bold (**) in "The **craft. Handwoven silk ...".
```

`npm test` runs the same validation over every committed article.

## Fields

| Field | Required | Notes |
| --- | --- | --- |
| `slug` | yes | Lowercase words joined by hyphens. Must match the file name. |
| `draft` | no | `true` hides the article everywhere (see Drafts). |
| `tag` | yes | Short label, such as `Buying Guide`. Shown as the eyebrow. |
| `title` | yes | The H1 and card title. |
| `description` | yes | Standfirst under the H1, and the card's hover text. |
| `seo.title` | yes | The full `<title>`, used exactly as written. Include "From The Trunk". |
| `seo.description` | yes | Meta description, used exactly as written. |
| `seo.primaryKeyword` | no | First entry in the page keywords. |
| `seo.keywords` | no | Extra keywords. Also searchable on the index. |
| `publishedAt` | yes | `2026-09-28` or `2026-09-28T09:30:00+05:30`. Controls order (newest first). |
| `updatedAt` | no | Same format. Must not be earlier than `publishedAt`. |
| `cover` | no | `{ "src", "alt" }` or `null`. Without one, a designed placeholder is shown. |
| `body` | yes | Array of blocks (below). |
| `faq` | no | `{ "heading", "items": [{ "question", "answer" }] }`. All answers are shown; nothing is folded away. |
| `about` | no | The "About From The Trunk" sign-off paragraph. |
| `closingLine` | no | Final line, set in italic serif. |

Reading time (about 200 words a minute, rounded up) and the date label ("28 Sep 2026") are worked out from the content. Don't add them to the file.

## Body blocks

```json
{ "type": "paragraph", "text": "Inline markup allowed." }
{ "type": "heading", "text": "A section heading" }
{ "type": "list", "ordered": true, "items": ["**Run-in.** Rest of the item."] }
{ "type": "table", "columns": ["Word", "What it tells you"], "rows": [["Vintage", "It is old"]] }
{ "type": "figure", "images": [{ "src": "/journal/<slug>/pallu.avif", "alt": "..." }], "caption": "Optional" }
```

- **heading** renders as an H2. Its anchor id comes from the text (for example `#how-much-do-preloved-sarees-cost`).
- **list** is bulleted unless `"ordered": true`.
- **table** needs at least two columns, and every row needs one cell per column. The first cell of each row is the row heading. Wide screens show a table; narrow screens show one card per row. It never scrolls sideways.
- **figure** takes one or two images; two are shown side by side on wider screens. Add a caption only when there is one to give. Don't make captions up.

## Inline markup

Paragraphs, list items, table cells, captions, FAQ answers and `about` accept:

| Markup | Result |
| --- | --- |
| `**bold**` | bold |
| `*italic*` | italic |
| `[text](/collection)` | link |

Nothing else is interpreted. HTML is shown as plain text. To write a literal `*`, `[` or `]`, put a backslash before it: `\*`. In JSON, that backslash has to be doubled: `"5 \\* 3"`.

Allowed link targets:

- Site paths (`/collection`), which render as client-side links.
- In-page anchors (`#questions`).
- `https://` links, which open in a new tab with `rel="noopener noreferrer"`.
- `mailto:` links.

Anything else, including `javascript:` and `//host`, fails validation.

## Links to other articles

A link to `/journal/<slug>` becomes a real link only if that article exists and is not a draft. Otherwise its words render as plain text, so the page never shows a broken link. When the target article is published, the link appears on the next deploy with no edit needed.

## Images

- Put the files in `public/journal/<slug>/`. The `src` must start with `/journal/<slug>/`.
- The two supplied photographs are exact exceptions: `/blog1a.avif` is the cover of `preloved-sarees-meaning`, and `/blog1b.avif` is its body figure after the vintage comparison. Other root paths are not allowed.
- Use lowercase, hyphenated file names ending `.avif`, `.webp`, `.jpg` or `.png`, for example `vintage-saree-pallu-daylight.avif`.
- Write `alt` text for every image. It is required.
- Recommended sizes:
  - Cover: at least 1600 × 1280 (5:4). It is cropped to 4:3 on phones and 5:4 on desktop. Index cards are 352 × 420, capped to the available width on narrow screens, so keep the subject central.
  - Single figure: at least 1400 × 934 (3:2).
  - Pair of figures: at least 800 × 1000 each (4:5).
- **A cover also needs a JPG for social previews.** WhatsApp, Facebook, X and Pinterest do not render AVIF. If the cover is `.avif` or `.webp`, add a `.jpg` (or `.png`) with the same name beside it, for example `cover.avif` plus `cover.jpg`, at 1200 × 630 or larger. The page picks it up automatically for `og:image` and the Pinterest share. Without one, social previews use the site's default JPG, never the AVIF. BlogPosting structured data can still use the article's AVIF cover.
- The two root AVIF exceptions have no approved JPG/PNG companions; this article uses the site's default JPG for social previews.
- If a referenced file is missing, it is left out rather than shown broken, and the build logs a warning:
  - a missing cover shows the placeholder;
  - if any image in a figure is missing, the whole figure is left out.

## Drafts

`"draft": true` removes the article from:

- the index and its search;
- the sitemap;
- static generation (its URL returns 404);
- link resolution (links to it render as plain text).

Remove the flag, or set it to `false`, to publish.

## Unknown URLs

A `/journal/<slug>` with no published article returns a real HTTP 404, as do deeper paths such as `/journal/<slug>/anything`. The site's app shell streams before a page can call `notFound()`, and a streamed page is already committed to a 200. So `proxy.ts` makes the call first, checking against the published slugs that `next.config.ts` reads from `content/journal` at build time (`lib/journal/published-slugs.ts`). Article pages only exist for build-time slugs anyway (`dynamicParams = false`).

This check runs in production builds only. Under `npm run dev`, an unknown slug shows the not-found page with a 200.

To rename a published article, add a permanent redirect from the old path in `redirects()` in `next.config.ts`. Next runs those before the proxy, so the old link keeps working. Redirects managed in the admin don't apply here, because `journal` is a reserved route.

## Search

The index filters in the browser as the reader types and keeps the query in `?q=`, so a search can be shared. It matches the title, description, tag, keywords and body, ignoring case and punctuation. "pre-loved", "pre loved" and "preloved" all match each other, and the same goes for pre-owned, pre-used and second-hand.
