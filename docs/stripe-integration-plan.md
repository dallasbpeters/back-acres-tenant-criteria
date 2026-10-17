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
- Browser and database tests currently use fixtures; actual Stripe sandbox checkout and actual endpoint delivery remain required after account access.

## Billing and Invoicing: next integration

The current payment request is an app record, not a Stripe Invoice. Recurring Billing and Stripe Invoicing are not implemented yet.

For a signed tenancy, store a Stripe Customer per payer and define the lease start, end, rent amount, due day, and payment preferences. Use Billing APIs for scheduled rent instead of a home-grown renewal loop. Do not automatically renew beyond the lease's authorized term. Do not enroll tenants in automatic debits without their explicit authorization and Stripe's mandate/consent flow.

Use Stripe Invoicing for hosted invoices, downloadable invoice PDFs, and receipts; use Checkout for one-time application fees and deposits. Do not expose both an invoice payment link and a separate Checkout request for the same obligation. Reconcile payments by one obligation ID.

Before enabling recurring billing, implement invoice.paid, invoice.payment_failed, applicable customer.subscription.* events, refunds, disputes, early fraud warnings, and customer.updated if customer details are mirrored. Provide payment-method management and a clear owner-managed lease-end/cancellation flow. A Stripe subscription is a payment schedule, not an executed residential lease.

## Tax

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
