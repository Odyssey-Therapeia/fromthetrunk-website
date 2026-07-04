# SERVER_ERROR_LOGGING_AUDIT

_Audit-only (Part 7). Method: grep across `api/hono/**`, `lib/payments/**`, `lib/auth/**` for `console.*` / logger calls carrying `body|address|phone|email|token|secret|DATABASE_URL|password|razorpay_|shipping`, plus review of the payment/webhook/OTP logging sites._

## Findings
| Check | Result | Evidence |
|---|---|---|
| No secret values logged | ✅ | no logger/console call emits `*_SECRET`, key, or token values |
| No `DATABASE_URL` logged | ✅ | `admin-debug` logs only a **shape** (`"pooled"` / `"direct-or-http"` / `"missing"`), never the URL |
| No Razorpay secret / webhook secret logged | ✅ | signature compared via `timingSafeEqual`; only `eventId` / order id logged |
| No auth/session token logged | ✅ | OTP keys use `hashToken(identifier)`; tokens not logged |
| No full address/phone/email in routine logs | ✅ | `auth-otp` uses `maskEmail(...)`; contact logs `[redacted-phone]` (seen in test output); order events log ids/amounts, not PII |
| SQL params redacted | ✅ (n/a mostly) | Drizzle parameterizes; no raw SQL logging of params found |
| Payment errors → user-safe messages | ✅ | `RAZORPAY_AUTH_FAILED`, `RAZORPAY_PAYMENT_LINK_CREATE_FAILED`, `PAYMENT_HOST_NOT_ALLOWED`, `AMOUNT_TOO_LOW` — coded, non-leaky; internal error object logged server-side only |
| Internal errors → generic 500 | ✅ | `onUncaughtError` global handler; routes return coded errors, not stack traces |
| Validation errors → clear 400/422 without internals | ✅ | zod-openapi returns structured validation errors; custom coded 400s (e.g. `INVALID_PAYLOAD`) |
| Request IDs attached | ✅ | `X-Request-Id` exposed via CORS; perf timings tracked per request |

## Detail
- **OTP**: `OTP_GENERIC_MESSAGE` ("If this email or account can continue, we've sent a code.") prevents account enumeration; email masked in logs; rate-limit key hashes the identifier so PII isn't stored in the limiter.
- **Webhook**: logs `eventId` only on signature failure/dedupe; never logs the raw body or signature.
- **Payments**: `logCreateOrder.error(..., { err })` logs the error object server-side (may contain a Razorpay error message, not customer PII); responses to the client are coded strings. Razorpay `notes` carry `orderId`/`userId`/`checkoutAttemptId` — **no address/phone/card PII** in notes. ✅
- **Contact**: logs redact phone; email handled via masked/identifier hashing.

## Flags
- **None material.** No secret, `DATABASE_URL`, token, or full-PII logging found. One low-priority note: `logCreateOrder.error("...", { err })` serializes the raw error object — ensure the Razorpay SDK error shape never includes request headers/keys (it does not in current SDK usage; keep an eye on SDK upgrades).

**Logging/error safety: GO.**
