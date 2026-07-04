# FINAL_PERFORMANCE_QA

_Method: Lighthouse (bundled via `@lhci/cli`), **mobile** form factor, 1 run/route, against the production build (`next start`, node 22, :3100). Budget from `lighthouserc.cjs`: **LCP ≤ 2500ms (error/blocking)**, **CLS ≤ 0.1 (error)**, performance category ≥ 0.70._

## Public-route results (mobile)
| Route | Perf | LCP | CLS | TBT | LCP verdict |
|---|---|---|---|---|---|
| `/` | 76 | **7.3 s** | 0 | 30 ms | ❌ >2.5s |
| `/collection` | 79 | **5.6 s** | 0 | 50 ms | ❌ |
| PDP `/collection/stretchfit-blouse` | 79 | **5.6 s** | 0 | 40 ms | ❌ |
| `/faqs` | 86 | **4.1 s** | 0 | 10 ms | ❌ |
| `/why` | 79 | **5.7 s** | 0 | 10 ms | ❌ |
| `/how-it-works` | 79 | **5.5 s** | 0 | 50 ms | ❌ |
| `/our-story` | 80 | **5.3 s** | 0 | 0 ms | ❌ |
| `/policies/privacy-policy` | 86 | **4.1 s** | 0 | 10 ms | ❌ |

## Analysis
- **LCP fails the 2.5s budget on 100% of public mobile routes** (4.1–7.3s). This matches the known context ("previous public mobile LCP checks failed across the main public route set").
- **CLS = 0 everywhere** ✅ (passes budget). **TBT ≤ 50ms** ✅ (little JS blocking). Performance *category* score (76–86) passes the ≥0.70 gate, but the **hard LCP CWV assertion fails**.
- **Likely cause = image LCP / render delay**, not JS: TBT is tiny and CLS is zero, so the bottleneck is the **largest image painting late** (hero/banner and large product imagery over mobile throttling). This is an **image-delivery/priority** problem (LCP image weight, `priority`/`fetchpriority`, responsive `sizes`, above-the-fold decode), consistent across content pages too.
- All are **public, indexable SEO routes** — so this is a real Core Web Vitals / ranking-signal risk, not a noindex transactional concern.

## Route classification
- **Public SEO routes (LCP matters for ranking + UX):** all 8 above — **failing**.
- **Noindex transactional routes (`/cart`, `/checkout`):** tracked separately as UX-only; not run in this slice. Their LCP can be accepted as noindex transactional risk.

## Not completed in this window (owner to run on node 22)
- Full `lhci:matrix` (public **desktop**, admin mobile+desktop). Desktop LCP is typically far better; admin is noindex.
- Multi-run (numberOfRuns>1) p75 with `optimistic` aggregation as the CI does — single-run numbers here are indicative and already well over budget.

## Verdict
Per the audit rule: *"If public mobile LCP remains above budget, production is not a clean GO."* → **Performance/LCP = accepted-risk-needed (NOT clean GO).**

- **Blocker?** For a *clean* GO, yes. Push may proceed only as **"GO with accepted LCP risk"** if the owner explicitly accepts it.
- **Accepted risk possible?** Yes — owner may accept and remediate post-launch.
- **Recommended remediation (no visual/media/crop change required — per constraints):** ensure the LCP image on each route has `priority`/`fetchPriority="high"` with correct `sizes`, serve modern formats already present (AVIF/WebP) at right dimensions, preconnect to the blob CDN, and defer the intro-gate/hero work off the LCP path. These are delivery-level changes, not content/crop changes.

**Gate — Performance/LCP: accepted-risk-needed (NO clean GO).**
