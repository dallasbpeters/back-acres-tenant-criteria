# API edge rate limiting

Vercel WAF applies the policy in `infrastructure/api-rate-limits.json` before API
handlers execute. This uses Vercel's distributed counters, without Redis secrets
or an in-process fallback. The checked-in JSON is the desired policy and audit
record; Vercel does **not** automatically apply it during deployment.

| Scope | Requests per 60 seconds, per IP |
| --- | ---: |
| Acknowledgments, applications, maintenance intake, checkout, lease signing | 30 |
| Google OAuth and session endpoints | 60 |
| Stripe webhook | 1,200 |
| All remaining `/api` paths | 600 |

Every existing API route matches exactly one policy. A catch-all covers new APIs;
public site pages and static assets are outside these rules. Tests verify route
coverage, disjoint budgets, and the enforcement configuration. The rules apply to
all request methods and all deployment environments.

Limits use Vercel's trusted client IP, not a user-controlled request header.
They are shared by clients behind the same public IP and counted independently
in each Vercel region. These are fixed windows, so bursts spanning a window
boundary can exceed one window's allowance. An exhausted budget returns HTTP 429
until that window resets. Existing per-record, hourly intake, email-code, and
payment enrollment checks remain necessary and unchanged.

Stripe has its own generous budget so event bursts do not compete with browser
traffic. Webhook signatures and idempotent processing remain mandatory. Stripe
retries failed deliveries; investigate persistent 429s before raising the limit.
Autopay revocation uses the general budget, separate from the stricter public
intake budget. Its existing enrollment-only limit still cannot block revocation.

## Manage and roll back

Project: `back-acres-tenant-criteria`, team: `dallaspeters`.

Inspect live rules and unpublished changes before editing:

```sh
vercel --scope dallaspeters firewall rules list --json
vercel --scope dallaspeters firewall diff
```

When tuning a rule, first change its exceeded action to `log`, review matching
traffic, then restore `rate_limit` to return 429. Changes are drafts until
published. Do not publish unrelated draft changes.

```sh
vercel --scope dallaspeters firewall rules edit "API public forms and signing" --rate-limit-action log --yes
vercel --scope dallaspeters firewall diff
vercel --scope dallaspeters firewall publish --yes
```

That is also the narrow rollback: it stops enforcement for that rule without
disabling other firewall protection. To re-enable the desired limit, edit with
`--rate-limit-action rate_limit`, inspect the diff, and publish. Keep the policy
JSON in sync with deliberate permanent changes.

Dashboard: [Back Acres firewall](https://vercel.com/dallaspeters/back-acres-tenant-criteria/firewall).
Reference: [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Verification

On October 18, 2026, all four live rules were active, valid, and matched the
checked-in policy, with no unpublished changes. A bounded read-only probe of an
invalid signing link produced 29 normal 404 responses and 7 edge 429 responses
(the log-mode smoke check had already consumed one request). Varying the supplied
`x-forwarded-for` header did not evade the per-IP limit. Public pages, branding,
and OAuth sessions remained 200, and unauthenticated private notices remained
401 while the signing budget was exhausted. No applicant records, emails,
charges, or signatures were created by the probe.
