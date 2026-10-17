# Back Acres Stripe integration plan

Prepared October 17, 2026 for https://back-acres-tenant-criteria.vercel.app.

## Account and development setup

The Stripe plugin is installed and its planner was run for Back Acres Rentals. Guide iguide_61Vb3tNDSz3YzmJLE41E3HJZMfjcF was accepted with hosted Checkout, programmatic invoicing, invoice metadata, Hosted Invoice Pages, and webhook-driven reconciliation. Official Stripe skills installed from https://docs.stripe.com supplement the planner. The planner's general recommendations are adapted below to residential leases; no live payment resources were created by planning.

Use an isolated sandbox in the owner's existing Stripe account. Authorize the CLI, verify the selected account, and use test-only credentials in Vercel Production during development. Store credentials as sensitive environment variables. A restricted test key is preferable when it grants the required Checkout permissions. Never commit a key or webhook signing secret.

Required server settings: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. PAYMENTS_LIVE_ENABLED stays false until actual account, payment, webhook, refund, and failure testing is complete. Both sk_live and rk_live keys are blocked by this gate.

## Payments: current implementation

- Owner creates a fixed, immutable request for rent, a deposit, an application fee, or another disclosed amount.
- Payer receives a private signed link and opens hosted Stripe Checkout. Payment methods are configured in Stripe, allowing eligible cards and bank methods without embedding card or bank details in this app.
- Server uses the database amount, not a browser-supplied amount. A database claim and stable idempotency key prevent concurrent session creation. An uncertain session-creation failure requires owner reconciliation instead of automatically creating another checkout.
- The success page never marks a request paid. Only a signed webhook can confirm payment. Validate the request ID, Stripe session, currency, and total before updating the ledger. Duplicate webhook delivery must not duplicate payments or regress a paid state.
- The first endpoint subscribes to checkout.session.completed, checkout.session.async_payment_succeeded, and checkout.session.async_payment_failed.
- Verified an actual $1 sandbox card payment through hosted Checkout and its signed webhook on the deployed app. Production checkout also reused its session on repeated clicks. No live funds were used.

## Billing and Invoicing: current implementation

Owners can create fixed-term monthly rent schedules using Stripe Subscription Schedules, one Customer per schedule, send_invoice collection, an explicit installment count, and end_behavior=cancel. Dates are limited to days 1–28 to avoid month-end ambiguity. Invoices are due when issued; future dates use noon UTC. Tenants open Stripe Hosted Invoice Pages to pay each invoice. No automatic debits or automatic lease renewals are configured. The owner must confirm the amount and authorized lease term before creation.

Signed invoice.finalized, invoice.paid, invoice.payment_failed, invoice.voided, invoice.marked_uncollectible and subscription_schedule created/updated/canceled/completed/released events reconcile the ledger. Handlers retrieve current Stripe records because event delivery can be out of order. Existing Stripe invoices use their hosted invoice URL, never a second Checkout session. The owner can stop future invoices; existing obligations and the legal lease remain separate.

Creation uses stable idempotency keys, a database uniqueness guard per active property/payer/environment, and an uncertain state requiring reconciliation rather than blind retries. Live mode remains blocked. Refunds, disputes, delayed bank outcomes, and full term-end tests remain requirements before real-money activation. Autopay and its tenant consent/payment-method-management flow are not implemented.

## Tax

Current live-account inspection on October 17, 2026: Tax Settings are active, but there are no Tax Registrations. The existing default category is General - Electronically Supplied Services (txcd_10000000), which must not be assumed to classify residential rental charges. Existing settings were left unchanged. Confirm rental-specific classification with the owner and tax adviser before enabling collection.

Do not enable automatic_tax merely because the business requested Stripe Tax. Read existing Tax Settings and registrations first, determine which charges are taxable with the owner's tax adviser, confirm product tax codes from Stripe's current catalog, and confirm active registrations. Do not register the business or change registrations without the owner's confirmed direction. Stripe Tax is sales-tax tooling, not rental-income tax accounting or a substitute for a security-deposit ledger.

When a taxable charge and registration are confirmed, test a sandbox calculation using the relevant address and inspect taxability_reason. A zero result must be explained; it is not proof of correct tax setup. Collecting tax does not automatically file all required returns.

## Before real money

Complete an actual sandbox card payment, delayed bank success/failure, repeated checkout clicks, duplicate/out-of-order signed events, expired checkout recovery, refunds, dispute reconciliation, and a lease-end billing test. Confirm fee allocation, refund policy, eligible payment methods, deposit accounting, Stripe account activation, and bank payout details with the owner. Replace only the environment values for live mode after those checks and explicit go-live authorization.

## Sources

- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- https://docs.stripe.com/billing/subscriptions/design-an-integration
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/invoicing
- https://docs.stripe.com/tax/set-up
- https://docs.stripe.com/keys-best-practices
