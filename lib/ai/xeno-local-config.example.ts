/**
 * xeno-local-config.example.ts — documentation only, checked in.
 *
 * Confidential business context (base Weave X programme description, owner map,
 * submission notes, etc.) is passed to the Xeno socket bridge via environment
 * variables, NOT as TypeScript source in this repo.
 *
 * To configure locally:
 *
 * 1. Create a .env.local file at the repo root (already gitignored by .env*.local).
 * 2. Add the following variables with their actual values:
 *
 *    WEAVE_X_CONTEXT=<full base context for the WEAVE X workflow — programme
 *      description, FTT strategic thesis, customer segment guidance, fact guardrails,
 *      Slack list URLs, etc.>
 *
 *    WEAVE_X_SUPPLEMENTAL_CONTEXT=<owner map, question assignments, and any
 *      per-session addenda appended after the base context>
 *
 * 3. Run the socket bridge with dotenv support:
 *    npx dotenv -e .env.local -- npx tsx scripts/xeno-slack-socket-bridge.ts
 *
 * Both variables are read by lib/ai/xeno-slack-agent.ts at runtime only.
 * They are never bundled into the Vercel deploy surface.
 * The fallback for WEAVE_X_CONTEXT when unset is a minimal neutral string;
 * always set the full context in .env.local for local development.
 */
export {};
