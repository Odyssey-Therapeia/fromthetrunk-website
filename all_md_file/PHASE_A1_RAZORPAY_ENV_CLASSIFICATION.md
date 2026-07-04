# Phase A.1 Razorpay Env Classification

Date: 2026-07-03

No env values or secrets were printed.

## Initial Classification

From Phase A and the starting Phase A.1 inspection:

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: live
RAZORPAY_KEY_SECRET: present
RAZORPAY_WEBHOOK_SECRET: present
NEXT_PUBLIC_SERVER_URL: present, non-local previously
NEXTAUTH_URL: present, non-local previously
ALLOW_UNSAFE_LIVE_PAYMENTS: missing/false
```

Initial status: BLOCKED for local/staging checkout because the public Razorpay key was live while the server key was test.

## Post-Fix Classification

After the local `.env.local` safety fix:

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: test
RAZORPAY_KEY_SECRET: present
RAZORPAY_WEBHOOK_SECRET: present
NEXT_PUBLIC_SERVER_URL: localhost
NEXTAUTH_URL: localhost
ALLOW_UNSAFE_LIVE_PAYMENTS: missing/false
```

## Rule Check

| Rule | Status |
| --- | --- |
| localhost/staging server key must be test | PASS |
| localhost/staging public key must be test | PASS |
| live keys only on `https://www.fromthetrunk.shop` | PASS for local config; code guard also now treats public live key as live mode |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` empty/false | PASS |
| do not run checkout if public key is live on localhost/staging | PASS; checkout was run only after the public key was fixed |

