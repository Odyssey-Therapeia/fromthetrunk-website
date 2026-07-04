# Phase G Deployed Auth Cookie Validation Report

Date: 2026-07-03
Decision: NO-GO.

## Scope Boundary

The Phase G brief requires deployed HTTPS auth/cookie verification on an approved staging/deployed domain before production cutover. This pass did not use customer accounts, did not trigger real OTP/email flows, and did not print cookie values.

## Deployed Domains Observed

| URL | Observation |
| --- | --- |
| `https://www.fromthetrunk.shop/` | HTTP 200. Public site responds over HTTPS. |
| `https://www.fromthetrunk.shop/robots.txt` | HTTP 200. |
| `https://www.fromthetrunk.shop/sitemap.xml` | HTTP 200. |
| Connector-visible deployment URL | SSO-protected; `robots.txt` probe returned 302 to Vercel SSO with noindex. |

## Auth/Cookie Checks

| Required check | Status | Evidence / blocker |
| --- | --- | --- |
| Approved staging/deployed test domain selected | BLOCKED | Connector-visible deployment is SSO-protected; custom domain ownership was not proven by connector metadata. |
| Internal test account approved | BLOCKED | No test account approval was available in this phase. |
| OTP login on deployed HTTPS | NOT RUN | Avoided real OTP/email flow without approved test identity/provider. |
| Set-Cookie names only recorded | NOT RUN | No deployed login was performed. |
| Cookie flags checked (`Secure`, `HttpOnly`, `SameSite`) | NOT RUN | Requires deployed login/session. |
| Session persists after refresh | NOT RUN | Requires deployed login/session. |
| Protected account routes checked | NOT RUN | Requires deployed login/session. |
| Logout clears session | NOT RUN | Requires deployed login/session. |
| Checkout session checked | NOT RUN | Requires deployed login/session and safe checkout test configuration. |
| Callback URLs checked for localhost/open redirect | NOT RUN | Requires deployed auth flow and env verification. |

## Related Local Evidence

Phase D previously established local auth/OTP/email behavior and session/account isolation, but Phase D explicitly left deployed HTTPS cookie validation as a production/staging gate. Phase G did not replace that deployed validation with local-only evidence.

The Phase G targeted Playwright run did pass the account/session isolation spec locally:

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec playwright test --project=chromium tests/e2e/site-feedback-fixes.spec.ts tests/e2e/mobile-screenshot.spec.ts tests/e2e/phase-c-checkout-isolation.spec.ts tests/e2e/auth-session-isolation.spec.ts
16 passed
```

## Result

Deployed HTTPS auth/cookie validation remains a hard NO-GO blocker.

Required next step: choose an approved deployed test domain, confirm env ownership and callback origins, approve an internal test account/provider path, then perform the login/session/logout/checkout cookie checks without printing cookie values.
