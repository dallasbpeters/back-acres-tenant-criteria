# Payment records and recovery

## Implemented controls

Invoice financial changes create `payment_history` rows in the same database
transaction. PostgreSQL triggers reject ordinary updates and deletes to these
history rows. Changes to cumulative refunded amounts are recorded even when the
status remains partially refunded. Duplicate updates that change no financial
fields do not create activity. Existing invoices receive a clearly identified
migration baseline, observed at migration time; no earlier events are fabricated.

This is invoice lifecycle evidence, not a complete double-entry ledger or a list
of individual charges, payout transfers, fees, partial payment allocations, or
bank settlement statements. Owners can view the latest 200 entries at
`/admin/payment-history`, including removed invoices. Tenants see history only for
invoices already shared with their authenticated account. Stripe remains the
source for detailed provider transactions. Do not treat an initiated ACH debit as
irrevocably settled; later returns and disputes may change its outcome.

An accepted ACH terms snapshot is queued transactionally in
`authorization_receipts`. Its original recipient, text, payer, and acceptance time
cannot be edited through normal updates. The enrollment page supplies a plain-text
download of the accepted terms. Stripe supplies its separate bank mandate.
A Resend batch sends queued copies; provider acceptance is recorded, not called
inbox delivery. Queueing a copy does not prove bank verification or payment.
Only new accepted authorizations are queued; deployment does not send historical
receipts to existing contacts.

The daily Vercel job at 05:00 UTC (`/api/internal/payment-recovery`) requires the
Production `CRON_SECRET` bearer credential and uses constant-time comparison.
It replays at most 500 Stripe events from the past three days, using the existing
current-record reconciliation checks, including a missed Checkout webhook after
a failed local session-ID save. It does not activate ACH enrollments,
create charges, retry debits, or change authorizations. Stripe and receipt recovery
are independent, so one service outage does not prevent the other from running.
Failures return 503 and log only `payment_recovery_failed`. The owner activity
page shows pending receipts and flags failed, incomplete, absent, or stale runs.
This is an owner-visible warning, not an external paging/alert delivery system.

The email provider's idempotency window is 24 hours. A provider-success/local-save
failure retried after that window can produce a duplicate copy; it cannot create
a duplicate debit. Provider acceptance still needs delivery/bounce monitoring.
An outage over three days or more than 500 recent events needs manual Stripe
reconciliation; a successful bounded run is not proof of lifetime completeness.

Global headers disable external framing and referrer transmission, restrict
resource sources, and disable plugins. Inline scripts/styles remain necessary for
Next/Clerk; the CSP is a baseline, not a nonce-based XSS guarantee. Signed bearer
links retain their existing behavior. Do not share them broadly; removing a Clerk
tenant assignment still does not revoke separately issued payment/enrollment links.

## Before enabling real payments

- Verify actual sandbox bank success, delayed failure/return, refund, dispute,
  stopping payments, receipt/mandate delivery, and recovery after a lost webhook.
- Have Texas counsel review the accepted ACH terms, electronic-record consent,
  stopping procedure, fees/refunds, deposit deductions/refunds, and notices.
- Define separate security-deposit accounting and refund deadlines. The invoice
  category is not deposit administration or escrow accounting.
- Approve a retention schedule with counsel/accounting, including dispute/legal
  holds. Preserve evidence; workspace removal is not physical data deletion.
- Verify restricted runtime database permissions, MFA on owner/provider accounts,
  backup retention, a successful isolated restore, and external outage alerts.
- Restrict Stripe API permissions and review the PCI questionnaire requested by
  Stripe. Hosted payment pages reduce the scope but do not remove obligations.

## Database recovery drill (not yet verified)

In Neon, check the production branch's actual restore window and plan. Create an
isolated recovery branch at a chosen time inside that window; do not rewind
production. Restrict its access and do not connect it to production email, Stripe,
or auth workflows. Verify schema, invoice/history counts, representative references,
and document records without exporting applicant details into logs. Record the
restore point, elapsed recovery time, validation results, and responsible person.
Protect exports and credentials as production data. A configured restore window
is not evidence that a restore has been tested. Clean up via the normal recoverable
workflow only after documenting results and retention needs.

## Credential rotation

The password previously shared in chat must be rotated if not already replaced.
A Neon database password belongs to a Postgres role on a branch; it is separate
from a Neon API key or Clerk credential. In the Neon project select the affected
branch, Postgres database → Roles → role menu → Reset password. The reset takes
effect immediately for new connections. Copy fresh pooled and direct connection
strings from Connect into the affected Vercel environment's `DATABASE_URL` and
`DATABASE_URL_UNPOOLED`, and into ignored local settings. Update any other service
using the same role. Redeploy and check database-backed pages. Do not print or
commit strings. Repeat for any branch using the leaked credential; resetting the
parent does not reset existing child branches. Review active connections because
a password reset is not proof that existing sessions have been terminated.

Use a SQL-created restricted runtime role; Console-created roles inherit Neon
administrative membership. Keep migration credentials separate. Grant only the
needed SELECT/INSERT/UPDATE privileges on application tables and DELETE on
`intake_limits`. Do not grant CREATE, TRUNCATE, ownership, or role administration.
The history trigger requires INSERT on `payment_history`; application code must
not expose arbitrary inserts. Remove UPDATE/DELETE on history and original
receipt evidence as appropriate. Database owners can disable triggers or truncate
tables, so append-only triggers do not replace restricted credentials, backups,
and privileged-access auditing. Test the role before switching the deployment.

## Incident response

On suspected exposure, preserve logs, isolate the affected access, rotate the
specific credential, review provider activity, and involve counsel/response help.
Record discovery time, affected records, containment, and notification decisions.
Texas AG reporting can apply to qualifying breaches involving 250+ Texans within
30 days; affected-person notice requirements can apply below that threshold.
Do not assume a small tenant count exempts the business. Do not send notifications
or permanently erase evidence as an automatic application action.

Sources:
- https://neon.com/docs/manage/roles
- https://neon.com/docs/manage/branches
- https://docs.stripe.com/payments/ach-direct-debit
- https://docs.stripe.com/security/guide
- https://www.consumerfinance.gov/rules-policy/regulations/1005/10/
- https://www.texasattorneygeneral.gov/consumer-protection/data-breach-reporting
- https://resend.com/docs/api-reference/emails/send-batch-emails
