# Phase A.1 Env Fix Report

Date: 2026-07-03

## Files Changed

Changed env file names only:

```text
.env.local
```

No env values were printed.

No env example file was modified.

## Old Classification

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: live
NEXT_PUBLIC_SERVER_URL: non-local
NEXTAUTH_URL: non-local
ALLOW_UNSAFE_LIVE_PAYMENTS: missing/false
```

## New Classification

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: test
NEXT_PUBLIC_SERVER_URL: localhost
NEXTAUTH_URL: localhost
ALLOW_UNSAFE_LIVE_PAYMENTS: missing/false
```

## Git Safety

`.env.local` is ignored by git:

```text
.gitignore:23:.env*.local .env.local
```

`package.json` and `pnpm-lock.yaml` were not changed.

## Vercel Staging Reminder

For staging later, set only test Razorpay keys and staging-local URLs:

```text
NEXT_PUBLIC_SERVER_URL: staging URL
NEXTAUTH_URL: staging URL
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: test
ALLOW_UNSAFE_LIVE_PAYMENTS: empty/false
```

No Vercel env was changed in this phase.

