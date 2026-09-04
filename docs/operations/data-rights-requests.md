# Data-rights requests — internal runbook

Internal working procedure for handling a customer request to **access**, **correct**,
or **erase** personal data, to **withdraw consent**, to **raise a grievance**, or for a
**nominee** to act after death or incapacity.

This is an operational runbook, not legal advice and not customer-facing copy. The
published position is in `lib/legal/policies.ts` (`privacy-policy`, `terms-of-service`,
`grievance-redressal`). If this document and the published policy ever disagree, the
published policy is what the customer was promised — fix the mismatch before acting.

**Scope of this release:** the process below is **manual and email-based**. The
application has no self-service export, no account-deletion route, and no nomination
record. That is a deliberate, documented position for this release, not an oversight —
see [Known gaps](#known-gaps).

> No database credentials and no destructive SQL belong in this file. Every step that
> touches production data is described by intent, and is performed by an authorised
> operator through the normal admin tooling.

---

## 0. Before you start

| Rule | Why |
| --- | --- |
| Never act on an email address alone. | Anyone can type an address. Identity must be reasonably verified first (step 3). |
| Never disclose data to an unverified requester. | A failed access request leaks more than a refused one. |
| Never promise "everything will be deleted". | Retention exceptions apply (step 9). The policy says so; say the same thing. |
| Never claim we can reach the customer's browser-local Drape Room images. | We cannot. They are only on their device. |
| Never claim we can delete records held by the AI provider. | Not verified for the configured provider, account, and endpoint. Do not assert it. |
| Do not link an anonymous Drape Room record to an account to make a search easier. | The ledger is deliberately pseudonymous. Linking it would create the association the design avoids. |

---

## 1. Receiving the request

Requests arrive at **hello@fromthetrunk.shop**. The published subject lines are:

- `Privacy Request` — access, correction, erasure, withdrawal, grievance
- `Urgent Privacy Concern` — suspected account compromise or an active privacy incident

A request is valid **however it arrives** (chat, phone, a reply on an order thread). If
it did not come to the privacy mailbox, forward it there so a single queue holds
everything.

Acknowledge receipt. The published grievance policy commits to acknowledging complaints
**within 48 hours** and resolving **within one month**, subject to receiving what is
needed from the customer or a third party. Do not invent a different deadline in
correspondence.

## 2. Logging the request

Record, in the privacy request log:

- date and time received, and the channel it arrived on
- requester's stated identity and the address/number they used
- **scope**: access / correction / erasure / withdrawal / grievance / nomination
- what they actually asked for, in their words
- whether they are the data subject or acting for someone else
- the acknowledgement date
- every subsequent action, with dates
- the closing date and outcome

The log is the evidence that the process ran. Keep it even when the answer is "no
records found".

## 3. Verifying identity

Verification must be **proportionate** to the sensitivity of what is being asked for.
Reading back an order status is not the same as erasing an account.

**Baseline — an account holder:**

1. The request comes from the address on the account, **and**
2. they confirm details that a stranger would not readily hold — for example a recent
   order number together with the delivery pincode and order date.

**If the address does not match the account**, or the request is for erasure or for
disclosure of a full data export, ask for a stronger signal: sign in and re-send from
the account, or confirm a code sent to the address/number already on the record. Do not
accept an ID document unless there is no weaker option that works, and do not retain a
copy longer than needed to decide.

**Guest orders.** Note an active weakness: order lookup currently accepts a session
email claim that is not verified against `users.emailVerified`. Do not rely on
"they were signed in" alone as proof for a guest-order request — verify separately.

**A representative or nominee** must show their authority, not just the subject's
details. See step 11.

If verification fails, say so plainly, say what would satisfy it, and do not disclose
whether any record exists.

## 4. Searching the relevant systems

Work from this map. An operator with admin access performs the reads.

| System | Holds | Keyed by |
| --- | --- | --- |
| `users` | name, email, phone, password hash, image, default address | user id / email |
| `addresses` | full postal addresses and phone | user id |
| `orders`, `order_items`, `order_events` | shipping name/address/phone/email, gift note, payment and refund references, internal notes | user id, or `shipping_email` for legacy guest orders |
| `wishlist_items` | saved products | user id |
| `restock_notify_requests` | email against a product | email, user id |
| `newsletter_subscribers` | email, consent state, confirmation token | email |
| `contact_submissions` | name, email, phone, message, hashed IP/user-agent | email |
| `site_feedback_submissions` | comment, page, hashed IP/user-agent | not subject-keyed |
| `auth_accounts`, `auth_sessions`, `auth_verification_tokens`, `auth_otp_challenges`, `auth_security_events` | login identifiers, tokens, hashed IP/user-agent | user id / identifier |
| `chat_conversations` | messages | user id |
| `ai_tryon_requests` | Drape Room operational metadata **only** | pseudonymous `session_tag` — **not** user id |

**`ai_tryon_requests` is not subject-addressable.** It carries no user id, no email, no
IP and no photo — only an HMAC-derived session tag, a product id, a background, a
provider/model, status, timings, byte size and cost. There is normally no way to prove
which rows belong to a given person, and we do not create one. If a customer asks about
a specific Drape Room request, ask for the **request reference** they were shown or the
`X-FTT-Tryon-Request-Id` value; without it, state honestly that the record is
pseudonymous and cannot be attributed.

## 5. Browser-local vs server-held data

Say this explicitly in every Drape Room-related answer, because customers assume the
opposite:

- **Browser-local, and unreachable by us:** the working photo and every generated
  preview. They live in the customer's own browser storage (IndexedDB). We cannot read
  them, export them, or delete them. The customer removes them with **“Clear my try-on
  data”** in the Drape Room, or by clearing the site's data in their browser. Downloaded
  copies and images shared into other apps are outside both parties' control.
- **Server-held:** the operational metadata row described above, and nothing else from
  the Drape Room.
- **Third-party AI provider:** the images required for a generation are sent to the
  configured provider and handled under its own API terms and data policy. We do not
  promise retrieval or erasure of provider-held records, because that capability has not
  been verified for our provider, account, and endpoint.

## 6. Preparing an access response

Assemble from the systems in step 4 and give the subject:

- the categories of personal data held about them
- the purposes each category is processed for
- the categories of recipients (payment gateway, logistics, hosting/technology,
  communications, professional advisers, authorities where required)
- the actual data, where disclosure is appropriate and verified

Do **not** include: password hashes, session or verification tokens, OTP hashes,
challenge/login-ticket hashes, hashed IP or user-agent values, internal fraud or risk
notes, other people's data (for example a gift recipient's address on someone else's
order), or anything about another customer.

Send the package to the verified address. Prefer an attachment over pasting personal
data into a message body.

## 7. Correction and updating

Self-service already covers the common cases; point the customer at them first:

- name and phone — account profile
- email — account profile, which sends a verification link to the new address
- password — account profile
- addresses — add, edit, delete in the address book

Operator-assisted correction is needed for anything else, notably shipping details on a
**placed** order and the content of a past support message. Correcting a shipped order's
address does not change what happened; record the correction rather than rewriting
history where the original is part of a transaction record.

Confirm back to the customer what was changed and when.

## 8. Erasure or anonymisation

There is no account-deletion route in the application today, so erasure is performed by
an authorised operator and must be reasoned through, not batch-applied.

Work in this order:

1. **Decide what is actually in scope.** "Delete my account" rarely means "destroy my
   invoices". Ask if it is ambiguous.
2. **Erase what has no retention basis** — wishlist entries, restock-notify rows,
   saved addresses no longer attached to an open order, marketing subscription.
3. **Withdraw consent** where the request is really about marketing (step 10).
4. **Minimise rather than destroy** where a record must survive: clear the free-text
   and contact fields that are not needed, keep the transaction skeleton.
5. **Anonymise** where the record must remain but the person need not be identifiable.
6. **Leave `ai_tryon_requests` alone.** It is pseudonymous, holds no image and no
   contact detail, and cannot be attributed to the requester. Explain that rather than
   deleting rows on a guess.
7. **Tell the customer what was done, what was kept, and why** — naming the ground from
   step 9, not just "for legal reasons".

Never delete a row that an open order, payment, refund, dispute, or investigation
depends on.

## 9. Retention exceptions

Erasure may lawfully be refused, in whole or part, where the record is needed for:

- fulfilling or completing an order
- tax, accounting, and statutory bookkeeping
- payment processing, chargeback, and fraud prevention
- an open dispute, complaint, return, or refund
- establishing, exercising, or defending a legal claim
- a regulatory, law-enforcement, or court obligation

State the applicable ground. Where full erasure is refused, restrict, minimise, or
anonymise as far as is reasonably possible, and say what remains.

## 10. Withdrawal of consent

Marketing consent can be withdrawn at any time. There is currently **no unsubscribe
route in the application** — an operator must update the subscription state manually and
confirm to the customer that it is done.

Explain that withdrawal is not retroactive and does not remove service messages that are
part of an order (dispatch, delivery, refund), nor records kept under step 9.

## 11. Grievances, and nominee requests

**Grievance.** If the customer is dissatisfied with the handling of their data, escalate
to the Grievance Officer named in the published Grievance Redressal Policy. Record the
escalation date in the request log. **The officer's name, designation, email, address,
phone, and working hours are unresolved placeholders in `lib/legal/policies.ts` today —
they must be filled in before this escalation path is real.** Until then, escalate
internally to the business owner and say so honestly.

**Nominee (death or incapacity).** A person may nominate someone to exercise their
rights in the event of death or incapacity. There is **no nomination record in the
application**, so a nominee request is handled entirely manually:

1. Do not act on an unverified claim. Bereavement is a common pretext for account
   takeover.
2. Ask for documentary evidence of the death or incapacity, and of the requester's
   authority (a nomination instrument, legal representative documentation, or a court
   order as applicable).
3. Have the business owner review before any disclosure or erasure.
4. Prefer the narrowest action that answers the request — closing an account and
   stopping communications is usually what is wanted, not a full data export.
5. Record the evidence relied on, and retain no more of it than needed.

## 12. Closing the request

- Send a written outcome: what was asked, what was done, what was kept and on what
  ground, and how to escalate if they disagree.
- Record the closing date and outcome in the log.
- Where identity verification failed, record that too, without disclosing whether a
  record existed.
- If the request revealed a defect (wrong data, a gap in this runbook, a missing
  control), raise it — the request log is a source of fixes, not just of compliance
  evidence.

---

## Known gaps

Carry these knowingly, or fix them. They are the reason this process is manual.

| Gap | Effect on this process |
| --- | --- |
| No account-data export endpoint or "download my data" flow. | Step 6 is assembled by hand from several tables. |
| No account-deletion route. | Step 8 is entirely operator-performed. |
| No newsletter unsubscribe route. | Step 10 is manual. |
| No bulk wishlist clear. | Erasure of saved items is per-item. |
| No nomination record. | Step 11 relies on documents, with no stored nominee to check against. |
| Grievance Officer details are placeholders in the canonical policy. | The published escalation path is not yet usable. |
| Guest-order access accepts an unverified session email claim. | Do not treat "signed in" as proof for guest-order requests (step 3). |
| Contact and feedback submissions are retained indefinitely and are not subject-readable. | They must be searched by hand and cannot be self-served. |
| `ai_tryon_requests` rows are retained indefinitely; the only scheduled job reconciles stale rows and deletes nothing. | There is no expiry to point at when explaining Drape Room retention. A retention period is a pending business/legal decision. |
