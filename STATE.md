# STATE.md — cross-session memory
> Protocol: `.claude/skills/project-memory`. Read this FIRST every session. Update it before ending any session that did work. Durable info only — git history is the journal, plans/ is the tracker.

## Current
- **Programme**: Shopify-parity, planned in `plans/` (master: `plans/000-master-plan.md`).
- **Active phase**: P1 — `plans/P1-stabilize.md`. P1-01 done (a0be510).
- **Branch reality**: `sprint-abe` carries the unmerged emergency guest-checkout fix (`96e6151`, never merged to main — PR #31 abandoned) + Xeno Slack agent + Drape Room + HR Deno app. Production = `main@caf23bb`, LACKS guest-checkout payment links.
- **Next concrete action**: Fan out P1-02 through P1-14 (parallel-safe; P1-06 before P1-07; P1-04+P1-06 before P1-19). P1-15 is ops (admin action). P1-20 merge after all above done.

## Standing facts (verified 2026-06-12)
- Tests 166/166 pass; lint clean; `tsc --noEmit` FAILS with 16 errors, all from untracked `ftt-hr-gmail-workflow/` (Deno app; fix = P1-02).
- Canonical prod domain is `https://www.fromthetrunk.shop`; `fromthetrunk.com` does NOT resolve yet is the code fallback (P1-14). Prod also serves at ftt-fromthetrunk.vercel.app.
- `CRON_SECRET` is configured in prod (release-reservations cron probe returns 401, not 500).
- Production has ZERO analytics (verified in repo and live HTML).
- pricePaise is GST-EXCLUSIVE; checkout adds 12% (`lib/payments/razorpay.ts:182`). Feed work is gated on #G-GST.
- Prod data contains a published test product ("test chiffon do not buy if not authorized") — P1-15.

## Known failure modes (traps for future sessions)
- **resend v6 never throws** — `{data,error}` must be checked; current code reports success on error (`lib/email/send.ts:42`, P1-03).
- **`formatINR` exists twice with different units** — db/money.ts takes PAISE, lib/email/templates.ts:44 takes RUPEES. 100× display bug if confused (P1-10).
- **`git add .` is catastrophic here** until P1-01: ~735MB untracked incl. finance xlsx and a 203MB tif. Always add scoped paths.
- **Extraction-pipeline JSON-LD false positive**: the site's ld+json is valid; naive scrapers that unescape `\n` reproduce a phantom "control character at 457" parse error. Verify the served artifact, not a re-processed copy.
- **Hot-deploying from unmerged branches loses fixes**: the May guest-checkout hotfix was silently overwritten by the next main deploy. PR-only promotion exists (`enforce-pr-only.yml`) — don't bypass it.
- **completePaidOrder is not atomic yet** (P1-04): webhook + callback race double-sends emails.

## Decisions
- **2026-06-12**: No replatform to Shopify — review evidence shows the custom core out-models Shopify for one-of-one inventory; gap is operational features → phased plan in plans/. (Full rationale: plans/000-master-plan.md §7.)
- **2026-06-12**: Small-model execution via packet pipeline (repo-scout → implementation-worker → verifier → fable-reviewer); maker never grades itself; 2-loop escalation to Fable-class re-spec.
- **2026-06-12**: Kept kit agents (scout/worker/verifier names referenced by workstream skills); added repo-scout/implementation-worker/fable-reviewer as ship-pipeline specialists; verifier upgraded in place with the ladder.
- **2026-06-13**: #G-GST resolved — GST-inclusive prices going forward ("for now" — revisit if pricing model changes). pricePaise will be redefined as GST-inclusive in P2-04; `razorpay.ts:182` add-on removed. P2-03 gate closed. Unblocks P5 feed work (Google India requires GST-inclusive prices matching landing page).

## Log
### 2026-06-13 — P1-01 executed via ship pipeline
- **Changed**: `.gitignore` (a0be510) — root-scoped dirs `/output/`, `/outputs/`, `/tmp/`, `/.playwright-mcp/`; root-scoped file patterns for PNGs/JSONs; `/docs/finance/` added.
- **Verified**: `git check-ignore` exits 0 for all 9 paths; `public/apple-touch-icon.png` exits 1 (unaffected); porcelain count 71→62; verifier PASS, fable-reviewer ACCEPT-WITH-MINORS (2 minors resolved in repair loop, 1 false-claim in worker report with no code impact).
- **Decisions**: #G-GST resolved — GST-inclusive prices (P2-03 gate closed, P5 unblocked). `/docs/finance/` gitignored not committed (contains real financial data + personal filesystem paths).
- **New failure modes**: `git check-ignore` exit-0 check only verifies the path IS ignored, not the match depth — an any-depth pattern still exits 0. Always check for `/` prefix on root-scope intent; verifier must grep the entry, not just check-ignore.
- **Next concrete action**: Fan out P1-02..P1-14 in parallel (see dependency graph in P1-stabilize.md). P1-06 before P1-07. P1-04+P1-06 before P1-19.

### 2026-06-12 — Reviews + programme planning (no product code changed)
- **Changed**: created plans/ (README, master, P1–P6), .claude/agents/{repo-scout,implementation-worker,fable-reviewer}.md, verifier.md upgraded, .claude/skills/{ship,project-memory}, STATE.md. CLAUDE.md: session-protocol pointer added.
- **Verified**: full-codebase review (31-agent workflow, 43 confirmed findings, 3 refuted); external Shopify-report fact-check (5 agents — its JSON-LD bug claim REFUTED, its analytics/cron claims confirmed); npm test 166/166; lint clean.
- **Failed**: `tsc --noEmit` (16 errors, ftt-hr-gmail-workflow only).
- **Next concrete action**: /ship P1-01.

## Archive
(none yet)
