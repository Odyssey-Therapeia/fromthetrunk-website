# FINAL_ACCESSIBILITY_QA

_Method: Lighthouse accessibility category (headless Chrome, mobile, production build on :3100) across public routes, plus the a11y-audit assertions enforced by `lighthouserc.cjs` (aria-*, button-name, color-contrast, document-title, heading-order, html-has-lang, image-alt, label, link-name, meta-viewport, tabindex — all at `error` level). No visible copy changed._

## Lighthouse accessibility scores (mobile)
| Route | A11y score |
|---|---|
| / | 96 |
| /collection | 96 |
| PDP (/collection/stretchfit-blouse) | 96 |
| /faqs | 96 |
| /why | 100 |
| /how-it-works | 100 |
| /our-story | 100 |
| /policies/privacy-policy | 100 |

All routes **≥ 96**, above the project's `categories:accessibility ≥ 0.90` gate. ✅

## Checklist
| Item | Status | Notes |
|---|---|---|
| No serious/critical axe/LH violations | ✅ | LH a11y 96–100; no category-blocking audit failures surfaced |
| `html-has-lang`, `document-title`, `meta-viewport` | ✅ | enforced by lhci, scores pass |
| Color contrast | ✅ | `color-contrast` audit at error-level, scores pass |
| Icon buttons have accessible names | ✅ | header icon buttons use `aria-label` (Account/Sign in, Liked products, Open menu, cart); colour swatches have `sr-only` label + tooltip |
| Decorative images `alt=""` | ✅ | hero/decorative + footer trunk use `alt=""`; gallery thumbnails `alt=""` |
| Meaningful images have alt | ✅ | product images use built alt text (`buildProductCardAlt` / PDP alt helpers) |
| Forms have labels | ✅ | `label`/`form-field-multiple-labels` enforced; newsletter/search inputs have `sr-only` labels |
| Mobile menu keyboard accessible | ✅ (component) | Radix `Sheet` (focus trap + Esc); **recommend manual keyboard pass** |
| Dialog focus trap/release | ✅ (component) | ConnectDialog / WelcomePopup / cart drawer use Radix Dialog / managed focus + Esc |
| Reduced-motion respected | ✅ | intro gate skips video for `prefers-reduced-motion`; footer/why/how-it-works honor reduced-motion; global `@media (prefers-reduced-motion)` rules present |
| Duplicate/nested `main` landmarks | ✅ | one `<main>` per route template |
| Logical headings / single `<h1>` | 🟡 | **Home renders 8 `<h1>`** (all other routes exactly one). Recommend demoting extras to `<h2>`. |
| Visible focus states | 🟡 needs manual confirm | focus-visible rings used on filters/buttons; recommend a manual keyboard-tab pass on nav + PDP |

## Safe non-content fixes identified (NOT applied — audit-only)
- Home page multiple `<h1>` → collapse to one `<h1>` + `<h2>`s (markup-only, no copy change). **Owner approval to edit markup.**
- (Optional) explicit `aria-label` audit on any remaining icon-only controls during manual keyboard pass.

**Gate — Accessibility: GO** (Lighthouse ≥96 everywhere; one non-blocking multi-`<h1>` hygiene fix recommended on home; a manual keyboard/focus pass is advised before push).
