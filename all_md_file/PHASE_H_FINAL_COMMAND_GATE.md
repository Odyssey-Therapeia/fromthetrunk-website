# Phase H Final Command Gate

Date: 2026-07-03
Result: NO-GO because `agent:check` fails public mobile LHCI LCP

All commands were run from `/Users/JP/Documents/codding projects/git/fromthetrunk-website` on branch `JP-Sprint`.

Because local Node is v25.4.0 and the project engine is `>=20.9 <25`, project gates used:

```bash
npx -y -p node@22 -p pnpm@10.28.0 ...
```

## Results

| Gate | Result | Notes |
| --- | --- | --- |
| `pnpm run lint` | PASS | ESLint completed cleanly. |
| `pnpm exec tsc --noEmit --pretty false` | PASS | No TypeScript errors. |
| `pnpm run build` | PASS | Next build completed; local build warned that local canonical origin was invalid and fell back to `https://www.fromthetrunk.shop`. |
| `pnpm run test` | PASS | 144 test files passed, 1745 tests passed. Intentional failure-path logs printed from tests. |
| `pnpm audit --audit-level moderate` | PASS | No known vulnerabilities found. |
| `git diff --check` | PASS | No whitespace errors. |
| Targeted Playwright suite | PASS | 16 passed. |
| `pnpm run agent:check` | FAIL | Verify phase passed; public mobile LHCI failed LCP on 11 audited routes, then matrix stopped before desktop/admin passes. |

## Targeted Playwright Command

```bash
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec playwright test --project=chromium tests/e2e/site-feedback-fixes.spec.ts tests/e2e/mobile-screenshot.spec.ts tests/e2e/phase-c-checkout-isolation.spec.ts tests/e2e/auth-session-isolation.spec.ts
```

Result: 16 passed.

## Agent Check Failure Details

Failed command:

```bash
npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check
```

The first LHCI matrix segment was public mobile. It failed LCP assertions:

- `/`: 5270.064 ms
- `/collection`: 5801.5625 ms
- `/cart`: 4698.794750000001 ms
- `/checkout`: 4742.361000000001 ms
- `/our-story`: 5121.84455 ms
- `/how-it-works`: 5652.820275000002 ms
- `/policies/privacy-policy`: 4213.211499999999 ms
- `/policies/terms-of-service`: 4290.61375 ms
- `/policies/shipping-delivery-policy`: 4212.42425 ms
- `/policies/return-refund-policy`: 4289.2392500000005 ms
- `/packing`: 4288.342000000001 ms

Reports were written under:

- `test-results/lighthouse/mobile/`

## Final Gate Decision

Final command gate is NO-GO until public mobile LHCI passes or the owner explicitly accepts the mobile LCP risk.

