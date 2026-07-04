# FINAL_PRE_PUSH_COMMAND_RESULTS

_Audit-only. Toolchain: **pnpm 10.28.0** (matches pin). node@22 (`v22.23.1`) was provisioned via `npx -p node@22` for build/test/parity; fast local gates (tsc/lint/audit) ran on local pnpm. Local machine node is **v25.4.0**, which is **outside the project's `engines` (`>=20.9 <25`)** — see caveat._

## Results

| # | Command | Result | Exact output | Prod blocker? | Accepted risk possible? | Owner approval req? |
|---|---|---|---|---|---|---|
| 1 | `pnpm --version` | ✅ | `10.28.0` (matches pin) | No | — | No |
| 2 | `pnpm audit` | ✅ PASS | `No known vulnerabilities found` | No | — | No |
| 3 | `pnpm run lint` (`eslint .`) | ✅ PASS | exit 0; warning: *Unsupported engine wanted node >=20.9 <25, current v25.4.0* | No | — | No (but re-run on node 22) |
| 4 | `pnpm exec tsc --noEmit --pretty false` | ✅ PASS | exit 0, no errors | No | — | No |
| 5 | `pnpm run build` (`next build`, node 22) | ✅ PASS | exit 0; full route table generated; `/search` dynamic; SSG for policies/guides/fabric/occasion | No | — | No |
| 6 | `pnpm run test` (`vitest run`, node 22) | ✅ PASS | **134 files / 1679 tests passed (0 failed)** in ~7.5s | No | — | No |
| 7 | `pnpm run verify:ux` (`build` + `lhci:matrix`) | ⚠️ PARTIAL / **LCP FAIL** | Full 4-config matrix not run in-sandbox (port 3000 held by dev server; matrix rebuilds ×4). Ran Lighthouse **mobile public** against a fresh `next start` (node 22) on :3100 — **LCP 4.1–7.3s on every public route, above the 2.5s hard budget** (perf score 76–86, CLS 0). See `FINAL_PERFORMANCE_QA.md`. | **Yes (LCP budget)** | **Yes** (owner may accept LCP risk) | Yes (accept LCP risk) |
| 8 | `pnpm run agent:check` (`verify` + `lhci:matrix`) | ⚠️ PARTIAL | `verify` = test+lint+build all ✅. lhci portion = same LCP finding as #7. | Same as #7 | Yes | Yes |
| 9 | `git diff --check` | ✅ PASS | clean (exit 0), no conflict/whitespace errors | No | — | No |

### Optional scripts
- `test:e2e` — **no `test:e2e` script exists**; Playwright is installed (`playwright.config.ts`, chromium present). E2E specs exist under `tests/e2e/` but were not executed in this window (require the dev/test server + fixtures). Owner may run `pnpm exec playwright test` separately.
- `demo:check` exists (`scripts/demo-readiness.ts`) — not run (demo-readiness, not production-gating).
- `analyze` — **no such script**.

## Caveats (must read)
1. **Node engine mismatch on the audit host.** Local node is `v25.4.0`; project requires `<25`. Build/test/lighthouse were run on provisioned **node 22.23.1** for parity, and all passed. Lint/tsc/audit ran on local pnpm (node 25) and passed. **Recommendation:** owner re-runs the full gate on the production node (22.x) before push.
2. **Full `lhci:matrix` (public+admin × mobile+desktop) was not completed in-sandbox** because the dev server occupies port 3000 and the matrix rebuilds four times. The **public mobile** slice — the one flagged in known context — was run and is reported. Admin/desktop Lighthouse still owed by owner.
3. No command output was hidden. The only failing gate is the **LCP performance budget**.
