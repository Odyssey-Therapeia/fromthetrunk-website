# Drape Room release runbook

This runbook is the release authority for the storefront Drape Room. It does
not authorize a production migration, provider call, or public enablement.

## Safety contract

- Deploy the first production build with `FTT_TRYON_ENABLED=false`.
- Never combine the first production deployment with public enablement.
- Generated images and customer photos remain browser-local; do not add them
  to Postgres, Blob storage, logs, or reconciliation payloads.
- Paid generation requires a browser-local full-body Pose Landmarker check:
  exactly one person with head, shoulders, hips, knees, and ankles/feet visible
  in portrait or near-portrait framing. Landmarks are ephemeral and must never
  be persisted or sent to analytics.
- Once provider dispatch has been attempted, a timeout or function termination
  is potentially billable. Do not retry automatically. Keep the daily quota and
  budget reservation conservative and tell support that the provider may have
  processed the request even when the browser received no image.

## Database migrations

The Drizzle journal currently does not register the standalone SQL migrations
`0028_ai_tryon_metadata.sql` and `0029_ai_tryon_reference_metadata.sql`. Do not
assume `pnpm db:migrate` applies them. Apply each reviewed Drape Room SQL file
explicitly with `psql`, in numeric order, first to an isolated staging Neon
branch and later to production only after separate authorization. Migration
`0029` must run after `0028` because it adds nullable reference metadata to
`ai_tryon_requests`.

Use a dedicated gitignored environment file and Node's env-file parser; never
`source` a credentials file into the shell. Migration
`0027_media_derivatives.sql`, derivative Blob storage, and every `FTT_MEDIA_*`
variable are optional future media operations and are not Drape Room launch
dependencies. Their separate procedure remains in
`docs/operations/media-derivative-rollout.md`.

Apply only `0029` after confirming `0028` is present:

```sh
tryon_database_url=$(node --env-file=.env.staging.tryon -p \
  'process.env.DATABASE_URL || ""')
test -n "$tryon_database_url"

/opt/homebrew/opt/libpq/bin/psql "$tryon_database_url" \
  -X \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -f drizzle/0029_ai_tryon_reference_metadata.sql
```

After applying the metadata migration, verify only its schema objects:

```sql
select to_regclass('public.ai_tryon_budget_buckets');
select to_regclass('public.ai_tryon_requests');
select to_regprocedure('public.ftt_ai_tryon_reconcile_stale(text)');
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ai_tryon_requests'
  and column_name in (
    'reference_contract_version',
    'product_reference_version',
    'reference_mode',
    'reference_count'
  )
order by column_name;
```

All three object results must be non-null, and the column query must return all
four reference fields as nullable, before generation is enabled. New requests
bind all four values before dispatch; only rows created before `0029` may keep
the group null.

## Staging gates

1. Prove every launch-catalogue saree has at least one approved, bounded
   current/original image. Safe originals are sufficient; derivatives remain
   optional.
2. Configure Redis, database credentials, `CRON_SECRET`, allowed origins,
   provider key, model, independent secrets, and monthly budget in staging.
3. Run the complete test, lint, type, build, `agent:check`, and desktop/mobile
   browser gates.
4. Exercise real shared Redis with parallel multi-instance requests, an open
   and half-open provider circuit, Redis failure, provider timeout/failure,
   function termination, and authenticated cron reconciliation.
5. Run one explicitly approved, controlled provider generation and inspect the
   visual result and ledger cost before production deployment.

## Cost-accounting gate

Pricing was checked against the official provider documentation on
2026-09-01. Reservations are admission-control amounts, not provider invoices
or guaranteed billing maxima:

| Provider/model | 2 total input images | 3 total input images | Settlement |
| --- | ---: | ---: | --- |
| Google `gemini-3.1-flash-image` | 100,000 microUSD | 100,560 microUSD | Reported prompt, image-output, and thinking tokens when all counters exist; otherwise the reservation is retained |
| OpenAI `gpt-image-2` | 200,000 microUSD | 220,000 microUSD | Conservative upper-bound calculation from reported aggregate input and output tokens; otherwise the reservation is retained |

Google documents 1,120 input tokens per image and $0.50 per million input
tokens, so its third-reference delta is 560 microUSD. OpenAI documents token
rates but not a static edit-input formula for this request shape, so the 20,000
microUSD third-reference increment is an explicit operational margin pending a
controlled billing sample. The `gpt-image-2` request intentionally omits
`input_fidelity`; that model always processes input images at high fidelity and
does not accept the parameter.

Recheck pricing before public enablement and whenever a model, quality, size,
or provider pricing version changes:

- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image>
- <https://developers.openai.com/api/docs/pricing>
- <https://developers.openai.com/api/docs/guides/image-generation>

## Production gates

Confirm the Vercel Node runtime, Fluid Compute setting, function duration and
memory, independent request/response body limits, environment assignments, and
hourly cron. Vercel Hobby accepts only daily cron schedules, so the current
`0 * * * *` schedule requires a Pro or Enterprise project. `CRON_SECRET` must
be present before this deployment and should contain at least 16 random
characters. The cron is independent of `FTT_TRYON_ENABLED`; migrations `0028`
and `0029` must therefore be verified even for the disabled-first deployment.

Vercel currently limits each function request and response body independently
to 4.5 MB. Keep the stricter application ceilings. The route's 240-second
duration requires either Fluid Compute or a plan/runtime configuration whose
maximum is at least 240 seconds; verify the deployed route rather than assuming
the dashboard setting.

Deploy disabled, verify configuration and schema read-only, then enable only
for an internal/canary audience. Monitor provider failures, budget reservations,
quota claims, Redis circuit state, latency, and visual fidelity before gradually
expanding access.

For production request identity, trust `x-vercel-forwarded-for` first and use
Vercel's overwritten `x-real-ip` only as the platform fallback. Generic
`x-forwarded-for` is a local/test proxy fallback only. HMAC the selected value
immediately; never log or store the raw address.
