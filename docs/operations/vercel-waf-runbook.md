# Vercel WAF and crawler runbook

No Firewall setting is changed by repository code. Start every custom rule in
Log, validate legitimate traffic, then publish the smallest rule. Custom rules
run before managed rulesets. Use Vercel verified Signature-Agent identity or
managed bot identity, never a spoofable User-Agent substring alone.

Official references: [managed rulesets](https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets),
[Bot Protection](https://vercel.com/docs/bot-management), and
[custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules).

## Rule order

1. `bypass-verified-public-search-preview`
   - GET/HEAD public pages and assets only.
   - Verified Googlebot, Bingbot, `facebookexternalhit`, Twitter/X preview and
     other business-approved preview identities.
   - Never bypass admin, auth or customer-write paths.
2. `bypass-critical-machine-callbacks`
   - Exact method/path only: POST `/api/v2/webhooks/razorpay`, GET
     `/api/v2/payments/payment-link/callback`, and GET `/api/v2/health`.
   - Monitoring bypass is health-only and requires verified monitor identity,
     pinned provider IP or cryptographic identity. Application signature checks
     remain mandatory.
3. `deny-training-only-and-confirmed-scrapers`
   - Exact verified `Meta-ExternalAgent` identity.
   - A short, business-approved list of training-only identities.
   - Confirmed scraper IP/CIDR or JA4 plus behavior tuples from Firewall logs.
   - Do not deny `facebookexternalhit`, `meta-externalfetcher`, verified search,
     social preview, or user-initiated fetch agents.
4. Log-only anomaly rules
   - Unknown/repeated/oversized `/collection` query combinations.
   - Repetitive/new-key `/_next/image` fanout.
   - Legacy paths such as `/Welcoming.mp4`, `/Welcoming.webm` and
     `/banner/collection_banner.png`.
   - Agents claiming SEO identities without Vercel verification.
5. Managed rulesets
   - Bot Protection: Log, inspect false positives, then Challenge.
   - AI Bots: keep Log for visibility unless the business explicitly accepts
     blocking search/user-fetch agents included by that broad ruleset.

## Derive thresholds; do not invent them

Observe a representative period. Derive limits from legitimate p95/p99 bursts,
per-navigation RSC count, normal image fanout, JA4/IP/ASN patterns and
carrier-grade NAT headroom. Then:

- query-heavy collection automation: rate-limit, then browser Challenge;
- repetitive image/legacy binary requests: rate-limit/429, not a JavaScript
  challenge that breaks subresource loads;
- unverified crawler automation: Challenge;
- confirmed malicious automation: Deny.

Validate Search Console fetch, Bing, social preview validators, Merchant/Meta
feed fetch, Razorpay callback/webhook, health monitoring and checkout conversion
before and after. Restore the previous version through the Firewall Audit Log on
regression.

Public Blob URLs use the Blob hostname directly; project-site WAF rules must not
be assumed to protect that traffic. Immutable bounded derivatives and guarded,
reference-aware retention are the Blob cost controls.
