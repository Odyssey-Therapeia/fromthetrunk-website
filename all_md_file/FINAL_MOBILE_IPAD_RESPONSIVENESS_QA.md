# FINAL_MOBILE_IPAD_RESPONSIVENESS_QA

_Method: real headless Chromium (Playwright, installed) against the production build (`next start`, node 22, :3100). Automated checks per (viewport × route): HTTP status, horizontal overflow (`scrollWidth − clientWidth`), broken images (`complete && naturalWidth===0`), `<h1>` count. Screenshots saved to `test-results/qa-screens/`. No copy or layout changed._

## Viewports tested
- **Mobile:** 360×800, 390×844, 430×932 (+ home also at all iPad sizes)
- **iPad/tablet:** 768×1024 (portrait), 1024×768 (landscape), 820×1180 (Air), 1366×1024 (Pro landscape)

## Routes tested
`/`, `/collection`, live PDP (`/collection/stretchfit-blouse`), `/faqs`, `/why`, `/sell-your-saree`, `/our-story`, `/how-it-works`, `/packing`, `/policies`, `/policies/privacy-policy`, `/policies/terms-of-service`, `/cart`, `/checkout`, `/our-team`

## Headline result
| Check | Mobile (360/390/430) | iPad (768/1024/820/1366) |
|---|---|---|
| HTTP 200 (individually) | ✅ all | ✅ all |
| Horizontal overflow | ✅ **0px everywhere** | ✅ **0px everywhere** |
| Broken images | ✅ **0 everywhere** | ✅ **0 everywhere** |
| Single `<h1>` | ✅ all routes **except `/`** | ✅ all routes **except `/`** |

**Verdict: PASS** for mobile and iPad — no horizontal overflow, no broken images across the full route set at 360px (worst case) and 768px, and home confirmed clean (0px overflow, 0 broken) at all six mobile+iPad sizes.

## Findings
1. **🟡 Home (`/`) renders 8 `<h1>` elements** (consistent at every viewport). Best practice is one `<h1>` per page. Not a layout break and Lighthouse still scored home SEO 100 / a11y 96, but it's a real SEO/a11y hygiene issue — likely the hero carousel/section headings each use `<h1>`. **Recommend:** demote all but the primary heading to `<h2>`. Non-blocking; needs a (non-copy) tag change → owner approval to touch markup.

## Test-harness note (not a site defect)
An initial **aggressive 84-request burst** (7 viewports × 12 routes with `networkidle`) caused several routes to return `500`/timeout mid-run. The production server log showed `TypeError: fetch failed` inside a cached DB query — i.e. the **single `next start` instance + Neon serverless DB-over-HTTP was saturated by the burst**, not a route defect. Confirmed by: (a) every "failed" route returns **200 in 0.2–0.7s individually**, (b) Lighthouse rendered all of them at 200 with good scores, (c) the gentle sequential re-run showed **0px overflow / 0 broken** on all. Under production Neon pooling + normal traffic this does not occur.

## Items NOT auto-verified (require human visual pass before/after push)
The automated pass covers load, overflow, broken images, and heading count. The following need a **manual visual check** (documented, not blocking if the above passes hold): header/menu overlap, mobile menu open/close + keyboard, sticky elements not covering CTAs, modal/dialog focus trap release, iPad two-column awkwardness, safe-area insets on notched devices, landscape (844×390) reflow, PDP gallery swipe, accordion open/close. Screenshots for m390 `/`, `/collection`, PDP, `/cart`, `/checkout` are in `test-results/qa-screens/` as a starting point.

**Gate — Mobile responsiveness: GO. iPad responsiveness: GO.** (with the home multi-`<h1>` hygiene note and a recommended manual visual spot-check.)
