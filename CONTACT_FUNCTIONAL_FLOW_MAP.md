# CONTACT_FUNCTIONAL_FLOW_MAP

_Evidence-based flow maps. Classification per the task's taxonomy._

## Flow A — ConnectDialog (header / how-it-works / why / sell-your-saree)
```
User clicks "Connect With Us"  (button)
→ ConnectDialog opens (Radix modal); startedAt recorded
→ user enters name*, email*, phone, topic, message*  (+ hidden honeypot, pagePath)
→ submit → fetch POST /api/v2/contact/submit
→ api/hono/routes/contact.ts:
   • IP rate limit 5 / 10min (durable)              [rate-limit.ts]
   • Zod validate (contactSubmitSchema)             [schemas/contact.ts]
   • honeypot + dwell<2s → fake success (bot)       [:119]
   • email rate limit 3 / hour (durable)            [:124]
   • dedupe: same email+messageHash in 15min → success no-op [:132]
   • DB INSERT contact_submissions                  [createContactSubmission → db/schema.ts:574]
   • send acknowledgement email → visitor           [contactAcknowledgementEmail → sendEmail]
       → mark acknowledgementEmailSentAt
   • send internal notification → getOrderNotificationRecipients()  [hello@ + abraham.boodala@]
       → mark internalNotificationSentAt
   → 200 { ok, message }
→ success UI ("…we've received your request. Our team will contact you shortly.")
→ dialog auto-closes after 900ms
Error path → 4xx/5xx / network → status="error" → "We couldn't send this right now. Please try again."
```
**Classification: API + DB + user acknowledgement email + internal notification email.**

## Flow B — Landing "Connect With Us" section (`#connect`)
Same as Flow A but fields = name/email/message only (no phone/topic), inline (non-modal). Same endpoint `POST /api/v2/contact/submit`.
**Classification: API + DB + user acknowledgement + internal notification.**

## Flow C — Floating review / feedback tab
```
User opens floating review tab → rating + comment (+ honeypot, startedAt, pagePath)
→ fetch POST /api/v2/site-feedback/submit  [floating-review-tab.tsx:176]
→ api/hono/routes/site-feedback.ts:
   • IP rate limit 10/10min + comment rate limit 3/hr (durable)
   • honeypot + dwell + dedupe
   • DB INSERT site_feedback_submissions  [createSiteFeedbackSubmission → db/schema.ts:616]
   • NO email sent (by design)
   → 200
```
**Classification: API + DB (save-only, no email)** — matches product rule "reviews save only, no acknowledgement".

## Flow D — WhatsApp (footer link + floating widget)
```
User clicks WhatsApp → https://wa.me/919731910202?text=<prefilled>  (new tab)
→ opens WhatsApp; conversation happens off-site
```
**Classification: WhatsApp only.** FTT receives a WhatsApp message only if the user actually sends it. No DB/email record.

## Flow E — Email (footer + policy pages + dialog link card)
```
User clicks hello@fromthetrunk.shop → mailto:hello@fromthetrunk.shop → user's mail app
```
**Classification: mailto only.** No subject/body template (plain address). User must manually send; if they close the mail app FTT receives nothing; no DB/acknowledgement.

## Flow F — Instagram
External link to instagram.com/from.thetrunk. **Page navigation only.**

## API detail (Flow A/B endpoint)
- **Route:** `POST /api/v2/contact/submit` (`api/hono/routes/contact.ts`).
- **Payload:** `{ name, email, message, phone?, topic?, pagePath?, startedAt?, website(honeypot), clientSubmissionId? }`.
- **Response:** `{ ok: true, message }` (generic; 429 on rate limit; 400 on invalid).
- **Validation:** `contactSubmitSchema` (Zod, bounded).
- **Rate limit:** IP 5/10min + email 3/hr, durable.
- **Same-origin:** global `sameOriginMutationGuard` (all `/api/v2` mutations).
- **DB helper:** `createContactSubmission` (`db/queries/contact-submissions.ts`) → `contact_submissions`.
- **Email:** `sendEmail` (Resend → SMTP → dev-mock).
- **Logging:** only `submissionId` on email failure; no raw message/PII logged.
