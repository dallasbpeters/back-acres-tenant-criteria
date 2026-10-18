# Stripe test coverage

Run `npm test` for all unit and Stripe tests, or `npm run test:stripe:coverage`
for the Stripe suite and an HTML report at `coverage/index.html`.
GitHub Actions runs both suites, type checking, and a production build on main
and pull requests. It retains the coverage report for 14 days. The Stripe gate
requires 100% lines, 99% statements, 98% branches, and 100% functions across the
payment routes and Stripe, ACH, billing-reconciliation, and link-security modules.
The mixed-purpose management route has payment creation/voiding tests but is not
included in those percentages; its other property and lease features are outside
this suite.

## Isolation

- PGlite runs PostgreSQL in memory. Tests apply every checked-in Drizzle SQL
  migration, use the real schema/queries/constraints, and reset fixture rows
  between cases. They never connect to Neon. The Neon batch boundary is represented
  by a real local PostgreSQL transaction; production HTTP transport is not emulated.
- Stripe resource methods are stubbed and fail by default unless a case explicitly
  supplies a response. The fallback SDK transport rejects external calls. Global
  fetch is blocked in the route suite, credentials are fake, and recipients use
  `example.invalid`.
- Webhook signatures use the real Stripe SDK, real raw request bodies, and real
  signature verification. Separate SDK tests use an injected fetch transport to
  exercise HTTP errors, serialization, connection loss, malformed JSON, and timeouts.
- Owner authentication uses the actual route guards and email allowlist, with
  only the Google session lookup stubbed. This suite does not test Google's OAuth
  service itself.

## Failure matrix

| Connection or operation | Covered behavior |
| --- | --- |
| Configuration | Missing Stripe settings; test/live separation; explicit live gate; missing link signing secret |
| Browser → API | Same-origin checks; allowed-owner checks; malformed/oversized/non-JSON bodies; invalid, modified, and wrong-purpose links |
| Payment creation → database | Immutable amount; integer cents; transactional audit record; audit failure rollback; idempotent repeated creation |
| Checkout → Stripe | Exact server-side amount/currency; trusted return URLs; stable idempotency key; session reuse; concurrent creation; rate limiting; expired/completed/missing-URL sessions |
| Checkout → database | Connection errors; claim conflict; provider success followed by local write failure; signed webhook recovery; ambiguous timeouts never create a second charge |
| Stripe → webhook | Missing/wrong/expired/tampered signature; unrelated events; session, amount, currency, reference and environment mismatch; duplicate/out-of-order events; DB failure returns retryable 503 |
| Delayed checkout payments | Processing is not paid; asynchronous failure/success; paid timestamp stability; late completion cannot reopen a failed payment |
| Owner → Billing | Authorized terms; date/installment/amount validation; future ACH start; same-day manual invoices; active-schedule uniqueness; concurrent different-ID requests |
| Billing → Stripe | Customer/product/schedule creation failures; finite installment/end behavior; provider success/local save failure; review state blocks blind retries |
| Tenant → ACH | Explicit consent stored before setup; ACH-only hosted setup; double enrollment; expired/closed/wrong-mode links; setup failures; stop winning setup race; revocation bypasses enrollment rate limit |
| Verified bank → schedule | Current SetupIntent/session/customer/mode checks; required active mandate; bank-method ownership; expanded/string references; missed start; removed enrollment; stop winning activation claim |
| ACH activation connections | Intent/session/mandate/method/list/product/schedule failures; retry recovery; orphan schedule recovery after lost local write |
| Revocation → Stripe | No immediate invoice or proration; schedule cancellation; checkout expiry; incomplete intent cancellation; failures keep canceling state and permit retry; inactive mandate revocation |
| Provider pagination | Orphan schedules and bank returns on later pages; duplicate-creation prevention across pages; empty/repeated pagination cursor fails instead of looping |
| Recurring reconciliation | Current Stripe records override stale event snapshots; latest payment attempt; paid/processing/failed/void/uncollectible/partial refund/refund/dispute; duplicate-event upsert and terminal-state preservation |
| One-time reconciliation | Deposits/fees/rent returns, refunds and disputes; current payment intent/charge validation; optional expanded charge; sparse/unrelated records ignored; stale checkout events cannot erase refund/dispute status |
| Cancellation → ledger | Expire checkout/void hosted invoice before local cancellation; provider failures preserve local state; submitted/settled payments cannot be canceled; wrong environment rejected; settlement during cancellation wins |
| SDK transport | HTTP 400/401/403/429/500; connection reset; timeout; malformed provider JSON; request endpoint, amount, authorization and idempotency serialization |

## Fixes exposed by the tests

- Prevent late checkout completion from changing failed bank payments back to
  processing, or erasing recorded refunds/disputes.
- Reconcile returns, refunds and disputes for one-time Checkout requests as well
  as recurring Stripe invoices.
- Prevent delayed bank verification from activating removed enrollments; accept
  expanded SetupIntent references.
- Traverse all provider pages during orphan recovery and payment reconciliation.
- Return retryable failure when opening the owner billing database connection fails.
- Reject cancellation of a payment request from another payment environment.

## External verification and limits

A read-only check on October 18, 2026 confirmed that the saved Stripe sandbox
credential could read the enabled webhook at
`https://back-acres-tenant-criteria.vercel.app/api/payments/webhook`, subscribed to
all 25 event types handled by this app, using API version `2026-09-30.endive`.
Vercel confirms the production Stripe key and webhook secret are configured;
it redacts their values when downloading environment settings.

These tests cover the implemented integration's boundaries and known failure
classes, not every possible financial or infrastructure failure. They cannot
prove real bank settlement, bank mandate email delivery, payouts, provider uptime,
live-account permissions, or Vercel/Neon network availability. No real payment,
refund, subscription, bank debit, or email is created by this suite. Do a separate
Stripe sandbox exercise with actual hosted Checkout and delayed bank outcomes
before enabling live collection. Tax calculations and payouts have no implemented
workflow here and are not claimed as tested.

Provider timeouts during checkout or schedule creation deliberately require owner
review in Stripe. Find the record using its invoice/schedule metadata and reconcile
it before creating another request. Retrying the UI is not a safe substitute.

Stripe references: [webhook signatures, retries, duplicate delivery and event
ordering](https://docs.stripe.com/webhooks), [ACH Direct Debit lifecycle](https://docs.stripe.com/payments/ach-direct-debit).
