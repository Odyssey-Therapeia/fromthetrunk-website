# CONTACT_REVIEW_CAPTURE_REPORT.md

Date: 2026-06-27

Recommendation: **GO to continue Phase 4.4B performance work**

This phase makes the Connect With Us dialog and floating Reviews tab real database-backed capture flows. No Razorpay, payment create-order/verify/webhook, cart reservation, OTP expiry, auth provider, checkout ownership, product pricing, or payment amount logic was changed.

## Changed Files

- `api/hono/app.ts`
- `api/hono/site-app.ts`
- `api/hono/routes/contact.ts`
- `api/hono/routes/site-feedback.ts`
- `api/hono/schemas/contact.ts`
- `api/hono/schemas/site-feedback.ts`
- `app/(site)/collection/page.tsx`
- `components/layout/connect-dialog.tsx`
- `components/sections/floating-review-tab.tsx`
- `db/queries/contact-submissions.ts`
- `db/queries/site-feedback.ts`
- `db/schema.ts`
- `drizzle/0021_contact_review_capture.sql`
- `lib/email/templates.ts`
- `tests/unit/contact-review-capture.test.ts`
- `tests/unit/site-feedback-fixes.test.ts`

`app/(site)/collection/page.tsx` was touched only to tighten the `searchParams` type to the Next 16 generated `PageProps` contract after `tsc` exposed the mismatch.

## Migration

- `drizzle/0021_contact_review_capture.sql`

The migration adds:

- `contact_submissions`
- `site_feedback_submissions`

It follows the recent repo migration pattern and uses `IF NOT EXISTS` guards. Old migrations were not edited.

## DB Tables

### `contact_submissions`

Stores visitor contact requests with:

- customer response fields: `name`, `email`, `phone`, `topic`, `message`
- source/context: `source`, `page_path`
- moderation/workflow: `status`
- email tracking: `acknowledgement_email_sent_at`, `internal_notification_sent_at`
- privacy/security fields: `ip_hash`, `user_agent_hash`, `message_hash`, `metadata`
- timestamps: `created_at`, `updated_at`

Indexes:

- `created_at`
- `status, created_at`
- `email, created_at`
- `message_hash, created_at`

### `site_feedback_submissions`

Stores internal review/feedback moderation data with:

- `rating`
- `comment`
- `source`
- `page_path`
- `status`
- `ip_hash`
- `user_agent_hash`
- `comment_hash`
- `metadata`
- timestamps

Indexes:

- `created_at`
- `rating, created_at`
- `status, created_at`
- `comment_hash, created_at`

No email or phone is collected for floating review submissions.

## API Routes Added

Public:

- `POST /api/v2/contact/submit`
- `POST /api/v2/site-feedback/submit`

Admin API:

- `GET /api/v2/admin/contact-submissions`
- `PATCH /api/v2/admin/contact-submissions/:id`
- `GET /api/v2/admin/site-feedback`
- `PATCH /api/v2/admin/site-feedback/:id`

Admin routes require `requireAdmin`, use bounded pagination, and return hashed IP/user-agent only. They do not return raw metadata.

## Validation Rules

Contact:

- `name`: trimmed, 2-80 chars
- `email`: valid email, lowercased, max 254
- `phone`: optional, max 32, loose phone character allowlist
- `topic`: optional, max 80
- `message`: trimmed, 10-2000 chars
- `pagePath`: optional same-origin path only, max 300
- `website`: honeypot
- `startedAt`: optional dwell-time timestamp
- `clientSubmissionId`: optional, max 80

Site feedback:

- `rating`: integer 1-5
- `comment`: trimmed, 3-1200 chars
- `pagePath`: optional same-origin path only, max 300
- `website`: honeypot
- `startedAt`: optional dwell-time timestamp
- `clientSubmissionId`: optional, max 80

Malformed input returns validation failure without echoing submitted message content.

## Rate Limits And Anti-Spam

Contact:

- IP route limit: 5 per 10 minutes
- email-hash limit: 3 per hour
- `requireDurable: true`
- honeypot and under-2-second submissions return fake success without insert/email
- same normalized email + message hash dedupes within 15 minutes

Site feedback:

- IP route limit: 10 per 10 minutes
- comment-hash limit: 3 per hour
- `requireDurable: true`
- honeypot and under-2-second submissions return fake success without insert
- same rating/comment/page path dedupes within 15 minutes

Same-origin mutation guard is already applied globally by the Hono apps.

## Email Behavior

Contact:

- Saves the DB row first.
- Sends visitor acknowledgement via `lib/email/send.ts`.
- Sends internal notification to configured FTT order notification recipients.
- Marks email sent timestamps only after successful sends.
- If email fails after DB insert, the public response remains success and the failure is logged redacted.
- Visitor email is never used as `from`.

Review:

- Saves rating/comment only.
- Does not send acknowledgement email.
- Does not publish automatically.

New templates:

- `contactAcknowledgementEmail`
- `contactInternalNotificationEmail`

User content is escaped in templates.

## UI Behavior

Connect dialog:

- No longer uses `mailto` for form submission.
- Posts to `/api/v2/contact/submit`.
- Adds optional phone/topic fields.
- Adds honeypot and dwell-time fields.
- Shows the required success message:
  - `Thanks for reaching out — we’ve received your request. Our team will contact you shortly.`
- Shows calm burgundy error:
  - `We couldn’t send this right now. Please try again.`
- Prevents duplicate submits while loading.

Floating review tab:

- Posts to `/api/v2/site-feedback/submit`.
- Rating is now integer 1-5 to match server validation.
- Adds honeypot and dwell-time fields.
- Shows existing thank-you state after success.
- Shows calm burgundy error:
  - `We couldn’t save this right now. Please try again.`
- Prevents duplicate submits while loading.
- Does not ask for login or email.

## Tests Added

`tests/unit/contact-review-capture.test.ts` covers:

- contact invalid email rejection
- contact message length rejection
- contact external `pagePath` rejection
- feedback rating range rejection
- feedback comment length rejection
- contact row creation
- contact acknowledgement and internal notification sends
- contact honeypot fake success with no insert/email
- contact duplicate dedupe
- contact email failure after insert still returns success
- contact rate-limit response
- feedback row creation
- feedback no-email behavior
- feedback duplicate dedupe
- feedback honeypot fake success

`tests/unit/site-feedback-fixes.test.ts` adds source checks that:

- connect dialog posts to `/api/v2/contact/submit`
- connect dialog no longer redirects form submit to `mailto`
- floating review posts to `/api/v2/site-feedback/submit`

## Verification

Commands were run with Node 22 via:

`npx -y -p node@22 -p pnpm@10.28.0 ...`

| Command | Result |
|---|---|
| `pnpm run lint` | Pass with existing warning in `app/(site)/our-story/page.tsx` for hook dependencies. |
| `pnpm run build` | Pass. Existing Edge Runtime static-generation warning remains. |
| `pnpm exec tsc --noEmit --pretty false` | Pass after clearing stale `.next/dev` generated types; collection page prop type was tightened to prevent the mismatch. |
| `pnpm run test` | Pass: 124 files, 1591 tests. Existing intentional failure-path logs appear from analytics/logger/pages/email tests. |
| `pnpm audit` | Pass: no known vulnerabilities found. |
| `pnpm run agent:check` | Verify phase passed, then failed at the known public mobile LHCI LCP gate before public desktop/admin scopes ran. This matches the existing Phase 4.4B performance blocker and is not specific to contact/review capture. |

## Security Notes

- Public routes use Zod validation.
- Inserts/updates use Drizzle query builder.
- No SQL string concatenation with user input.
- Same-origin mutation guard applies through app middleware.
- IP and user-agent are stored only as hashes.
- Raw cookies, auth headers, OTPs, login tickets, and secrets are not stored.
- Public responses do not include internal status, user id, role, metadata, admin notes, or raw DB errors.
- Email templates escape user content.
- No review email is sent.
- No live email smoke was run.

## Remaining Risks

- Admin UI screens were not added; retrieval is available through admin API routes only.
- Live Resend delivery should be smoke-tested in staging with approved test sender credentials.
- If product wants `reply-to`, `sendEmail` needs a safe explicit option; this phase did not add it.
- Contact/review analytics were not added to avoid expanding scope and storing extra PII.
- Full `agent:check` still cannot pass until the existing public mobile LCP release gate is resolved or formally rebaselined.

## GO / NO-GO

**GO** to continue Phase 4.4B performance work.

This contact/review capture addition is complete enough for staging validation. Production release still depends on the existing broader release blockers from the security/performance reports.
