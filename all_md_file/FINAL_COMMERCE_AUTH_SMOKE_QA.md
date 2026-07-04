# FINAL_COMMERCE_AUTH_SMOKE_QA

_Read-only / non-destructive. No code changed, no data changed, no live payment initiated. Verified against the production build (`next start`, :3100)._

## Storefront render (read-only)
| Flow | Result |
|---|---|
| Homepage loads | ✅ 200 |
| Collection loads | ✅ 200 |
| PDP loads | ✅ 200, product availability + price render, gallery renders |
| Product availability display | ✅ "IN STOCK" badge + stock-aware Add-to-Bag on PDP |
| Cart page opens | ✅ 200, `noindex` |
| Checkout page opens | ✅ 200, `noindex` |
| Build routes present | ✅ `/cart`, `/checkout`, `/checkout/confirmation`, `/checkout/confirmation/receipt`, `/api/v2/[...route]` all built |

## Auth / protection (verified)
| Check | Result |
|---|---|
| `/account/orders`, `/account/wishlist`, `/account/addresses` | ✅ **307 → /account/sign-in?callbackUrl=…** |
| `/account` root | 🟡 200 client-gate (renders sign-in redirect; sub-routes protected) |
| `/admin`, `/admin/orders` | 🟡 200 **sign-in/unauthorized gate** — no order/customer data leaked |
| Wishlist ownership | ✅ `/account/wishlist` protected; header wishlist count fetched from `/api/v2/wishlist` (auth) with guest fallback |
| Order pages protected | ✅ `/account/orders/[id]` behind auth redirect |
| Admin pages protected | ✅ gated (client auth); **recommend also `noindex` meta on admin** |
| cart/checkout/account excluded from sitemap + `noindex` | ✅ confirmed |

## Interactive flows NOT executed here (require test-mode secrets / a real session)
These are **not runnable in this audit** without live/test credentials and an authenticated session, and per instructions live payment must not be used:
| Flow | Status |
|---|---|
| Add-to-cart → reserve (`/api/v2/cart/reserve`) round-trip | ⏳ needs running app + DB write (not exercised; unit tests cover cart/reserve logic — all pass) |
| Cart update/remove | ⏳ client store logic covered by unit tests (pass); manual click-test recommended |
| Checkout shipping step UI | ⏳ renders; full step-through needs a session |
| **Payment step (Razorpay)** | ⏳ **owner sign-off required** — must be validated in **test mode** with `NEXT_PUBLIC_RAZORPAY_KEY_ID` (test) + server `RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`. Not testable from repo. |
| OTP / login | ⏳ **owner sign-off required** — needs OTP/SMTP/RESEND provider creds in prod env |
| Webhook signature verification | ✅ covered by unit tests (`webhooks-signature.test.ts`, `webhooks-route.test.ts` — pass) |

## Env documentation to confirm (owner)
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`, OTP/SMTP/`RESEND_*` — all referenced via `process.env` and listed in `.env.production.example`; **must be set with real values in the production host.**

## ⚠️ Migration gate (from safety snapshot)
Two **new, uncommitted** migrations must be applied to production DB as a controlled step **before/with** push:
- `drizzle/0024_order_item_selected_options.sql`
- `drizzle/0025_payment_hardening.sql`

Payment/order/webhook code has been modified alongside these — **owner must confirm the payment-hardening changes are intended, tested in Razorpay test mode, and the migrations are applied in the right order.**

**Gate — Commerce/auth/payment smoke: OWNER SIGN-OFF REQUIRED.** Storefront + protection verified; payment/OTP/live flows and the two new DB migrations require the owner to validate in test mode and apply migrations.
