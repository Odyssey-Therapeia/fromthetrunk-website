# Phase D Auth Provider Env Classification

Date: 2026-07-03

Values were not printed. Status reflects local `.env.local` only, not production Vercel.

| Env area | Local status | Classification | Required for launch | Fail behavior | User impact if missing |
| --- | --- | --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Missing | Direct Upstash name absent | No if KV aliases are present | Uses alias or in-memory outside required production paths | None if alias pair is configured |
| `UPSTASH_REDIS_REST_TOKEN` | Missing | Direct Upstash name absent | No if KV aliases are present | Uses alias or in-memory outside required production paths | None if alias pair is configured |
| `KV_REST_API_URL` | Present | Vercel KV durable limiter URL alias | Yes for production durable limiter | Required routes fail closed without durable pair in production | OTP/login/cart/payment/search mutations can return 503 |
| `KV_REST_API_TOKEN` | Present | Vercel KV durable limiter token alias | Yes for production durable limiter | Required routes fail closed without durable pair in production | OTP/login/cart/payment/search mutations can return 503 |
| Durable limiter pair | Present | Local/staging-ready if values are valid | Yes | 503 for `requireDurable` non-loopback production requests if missing | Login/OTP/payment/cart/search blocked safely |
| `RESEND_API_KEY` | Present | Resend configured, live-capable | Yes unless SMTP/test provider is selected | `sendEmail` catches provider failures and returns false | OTP may not arrive; route stays generic |
| `RESEND_FROM_EMAIL` | Present | Sender configured | Yes for Resend launch | Defaults if missing | Delivery/reputation risk if wrong |
| SMTP envs | Missing | SMTP fallback not configured | No if Resend is used | Falls through to Resend or dev mock | No SMTP fallback |
| `NEXTAUTH_SECRET` | Present | Auth/JWT secret configured | Yes | Auth/session token verification fails or insecure fallback risk | Login/session breakage |
| `NEXTAUTH_URL` | Present | NextAuth URL configured | Yes for deployed auth callbacks | Callback URL behavior may drift if wrong | Sign-in redirect/session issues |
| `AUTH_OTP_SECRET` | Present | OTP hash secret configured | Yes | Falls back only in dev-compatible paths | OTP verification breakage if changed/invalid |
| `AUTH_OTP_TOKEN_SECRET` | Present | Token/IP/UA hash secret configured | Yes | Falls back only in dev-compatible paths | Challenge/ticket hash mismatch |
| `AUTH_SECRET` | Missing | Alternate auth secret absent | No if `NEXTAUTH_SECRET` present | Fallback only | None |
| `PAYLOAD_SECRET` | Missing | Legacy fallback absent | No for target stack | Fallback only | None |
| `NODE_ENV` | Missing in env file | Runtime supplies as needed | Runtime dependent | Production checks depend on actual runtime | Misclassification risk if deployment env wrong |
| `VERCEL_ENV` | Missing locally | Local classification | Vercel supplies on deploy | N/A | N/A |

## Classification Result

Local env is ready for safe mocked/local Phase D tests. Resend is configured but was treated as live-capable, so Phase D did not send real email. Production launch still needs direct Vercel production env verification without printing values.
