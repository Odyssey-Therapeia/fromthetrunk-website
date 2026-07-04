# Phase F Deployed Auth/Cookie Validation Plan

Status: not executed. No deploy was performed and no staging URL credentials were supplied.

Run this plan only against approved staging or production HTTPS domains with test-safe user data. Do not print cookie values, tokens, OTP values, emails, phone numbers, addresses, payment links, or secrets.

## Staging Validation Steps

1. Open approved staging URL over HTTPS.
2. Start login/sign-in with a test user.
3. Complete OTP using approved test-safe path only.
4. Inspect response headers for `Set-Cookie` names only:
   - do not copy values;
   - confirm `Secure`;
   - confirm `HttpOnly` for server/session cookies;
   - confirm `SameSite` policy;
   - confirm path/domain are appropriate for staging.
5. Refresh page and confirm session persists.
6. Visit protected account route and confirm it is readable only after login.
7. Log out.
8. Confirm logout clears session and protected account route redirects or blocks.
9. Start checkout as the test user with test-safe product/payment setup only.
10. Confirm checkout session is readable over HTTPS.
11. Confirm callback URLs match staging domain.
12. Confirm no callback or redirect points to localhost.
13. Attempt malformed callback/redirect target and confirm no open redirect.

## Production Validation Steps

Run only after production env verification and owner approval.

1. Open `https://www.fromthetrunk.shop`.
2. Repeat the staging flow with an approved internal test account.
3. Confirm production cookies are `Secure`.
4. Confirm production session survives refresh/navigation.
5. Confirm logout clears the session.
6. Confirm callback URLs use the production custom domain only.
7. Confirm no preview or localhost callback remains.

## Launch Classification

HTTPS deployed-domain auth/cookie behavior: NO-GO until verified on deployed HTTPS domain.
