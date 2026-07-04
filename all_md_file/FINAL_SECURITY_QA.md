# FINAL_SECURITY_QA

_Audit-only. No auth/payment/API logic changed. No secret values printed. Headers checked against the production build (`next start`, :3100)._

## Secrets & env
| Check | Result |
|---|---|
| Hardcoded secret literals in source (`rzp_live_`, `sk_live_`, `whsec_`, inline `AUTH_SECRET=`, `postgres://user:pass@`) | ✅ **none found** |
| `.env*` tracked in git | ✅ only `.env.production.example` (template — no real values) |
| `NEXT_PUBLIC_*` exposure | ✅ all legitimately public: `GTM_ID`, `RAZORPAY_KEY_ID` (public key id, not secret), `SERVER_URL`, `INSTAGRAM_*`, `WHATSAPP_NUMBER`, `FTT_GST_RATE`, `FTT_SHIPPING_*`, `USE_LIVE_SOCIAL_FEED`, `ELECTRIC_SHAPE_URL`. No private secret in a `NEXT_PUBLIC_` var. |
| Secrets printed in logs | ✅ none observed; contact logs redact phone (`[redacted-phone]`) |
| Canonical origin | ✅ `lib/seo/site-url.ts` → `https://www.fromthetrunk.shop`; explicitly falls back off `localhost` / `*.vercel.app` so preview hosts never leak into canonicals |
| `.env.production.example` values | ✅ `SITE_URL`, `NEXT_PUBLIC_SERVER_URL`, `NEXTAUTH_URL` = `https://www.fromthetrunk.shop` |
| Razorpay keys / webhook secret / AUTH_SECRET / DATABASE_URL | ✅ referenced via `process.env` only; documented in `.env.production.example`, not in code |

> **Owner action:** confirm production env has real `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `DATABASE_URL`, OTP/SMTP/RESEND set in the host (Vercel) env — these cannot be verified from the repo.

## Security headers (production `next start`)
| Header | Present | Value |
|---|---|---|
| `X-Frame-Options` | ✅ | `DENY` |
| `X-Content-Type-Options` | ✅ | `nosniff` |
| `Referrer-Policy` | ✅ | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | ✅ | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Strict-Transport-Security` | ✅ | `max-age=31536000; includeSubDomains` |
| `X-DNS-Prefetch-Control` | ✅ | `on` |
| CSP | ⚠️ **Report-Only** | `Content-Security-Policy-Report-Only` present (not enforcing); `report-uri /api/v2/security/csp-report`. Allows `'unsafe-inline'` scripts (Next + GTM), Razorpay/GA hosts, blob storage img. |
| `frame-ancestors 'self'` / `frame-src` | ✅ | in CSP; Razorpay checkout framed via `frame-src https://*.razorpay.com` |

**CSP classification:** MEDIUM / **accepted risk possible**. Report-Only means the CSP is *not enforced* — a staged rollout posture. Acceptable for launch (collect violations first), but not a hardened CSP. `'unsafe-inline'` on `script-src` weakens it. Owner may accept and enforce later.

## Route protection & exposure
| Check | Result |
|---|---|
| `/account/orders`, `/account/wishlist`, `/account/addresses` | ✅ **307 → /account/sign-in?callbackUrl=…** (server-protected) |
| `/account` (root) | 🟡 200 — renders a client-side auth gate ("REDIRECT" to sign-in, no user data). Sensitive sub-routes are protected. Acceptable; verify no PII in gate. |
| `/admin`, `/admin/orders` | 🟡 200 — renders a **"Sign in" / unauthorized gate** (client-gated; **no order/customer/revenue data leaked** in the response). |
| `/admin` meta robots | 🟡 **`index, follow`** — admin should be `noindex`. Mitigated: `robots.txt` disallows `/admin/`. Recommend applying `PRIVATE_NOINDEX_ROBOTS` to the admin gate page. |
| API docs / OpenAPI | ✅ `/api/v2/docs` → **404**, `/api/v2/openapi.json` → **404** (not exposed) |
| `/swagger`, `/api/docs` | 🟡 return **200 but soft-404** (catch-all "Page Not Found") — **not a docs exposure** (no swagger/openapi served). This is an SEO soft-404 issue (see SEO report), not security. |
| Secure/HttpOnly/SameSite cookies | ⏳ **owner to confirm on HTTPS prod** — NextAuth default session cookies are `HttpOnly`+`SameSite=Lax` and `Secure` on HTTPS; not fully verifiable on local http. |
| `dangerouslyAllowSVG` | ✅ **not enabled** (SVG not served through the image optimizer) |
| `dangerouslySetInnerHTML` | 🟡 used for **JSON-LD (sanitized via `safeJsonLd`)** and **admin-authored CMS rich-text/theme** — trust boundary is admin. Acceptable; confirm CMS rich-text is sanitized on input. |
| Fake review/rating schema | ✅ none (see SEO/Product report) |

## Classification summary
- **Blockers:** none in the header/secret layer.
- **High risk:** none found in-repo (pending owner confirmation of production env secrets + HTTPS cookie flags).
- **Medium / accepted-risk-possible:** CSP is Report-Only (not enforced); `/admin` served with `index,follow` meta; soft-404s return 200; CMS `dangerouslySetInnerHTML` trust boundary.
- **Needs owner approval/confirmation:** production env secret presence; HTTPS cookie `Secure/HttpOnly/SameSite`; decision to enforce CSP.

**Gate — Security headers/secrets: GO** (headers strong, no committed secrets). **API docs exposure: GO** (real docs 404). Medium items are accept-or-fix, not blockers.
