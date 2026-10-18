# Back Acres · Tenant Selection Criteria & Acknowledgment

A responsive, GitHub-ready Next.js application for `7800 Back Acres Rd, Amarillo, TX 79119`, designed for deployment on Vercel. Applicants can review tenant-selection criteria, acknowledge them electronically, and receive an emailed receipt. Copies are emailed privately to both property owners (the landlord and Tandra) through Resend.

**Status:** FINAL — version `FINAL-2026-10-10-v1`. Published at the property owner’s direction. Submissions require the enable setting and all required email configuration.

## Important before publishing

1. The final criteria are maintained in [`lib/policy.ts`](lib/policy.ts). Review any future changes before publishing and keep the receipt version synchronized.
2. Increment `POLICY.version` every time you materially change the criteria. Each email records the complete criteria, version identifier, SHA-256 digest, date/time, typed name, email, and technical request metadata.
3. Have qualified Texas counsel verify statutory compliance, including whether your electronic presentation and acknowledgment satisfy the statute's **printed notice** requirement and electronic-consent rules. Texas Property Code § 92.3515 requires notice when the rental application is made available; a new notice **cannot retroactively satisfy** an earlier application.
4. Add your actual sender and recipient email addresses as **Vercel Environment Variables**. Do not hardcode emails or commit keys.
5. Consider protecting the public form against automated abuse using Vercel's WAF/rate limits and the optional `ACCESS_CODE` setting. The included hidden honeypot and same-origin check are **not** comprehensive abuse protection.
6. The typed name is a basic electronic acknowledgment, not strong identity verification. The app **does not** verify that an email address belongs to the signer. Confirm whether an additional identity check or e-sign provider is needed.

## Deploy with GitHub and Vercel

1. Create a GitHub repository (e.g. `back-acres-tenant-criteria`). Push all files in this folder, excluding files in `.gitignore`.
2. In [Vercel](https://vercel.com/new), select **Add New Project → Import Git Repository**. Choose your repository; Next.js is automatically detected.
3. Verify your sending domain in [Resend](https://resend.com/domains). A verified sender is needed for sending to actual applicants.
4. In **Vercel → Project → Settings → Environment Variables**, create the following **server-side** variables (no `NEXT_PUBLIC_` prefix):
   - `RESEND_API_KEY` — your Resend API key.
   - `FROM_EMAIL` — e.g. `Back Acres Rentals <no-reply@your-verified-domain.com>`.
   - `LANDLORD_EMAIL` — your email address.
   - `TANDRA_EMAIL` — Tandra's email address.
   - `ACCESS_CODE` (optional) — an invitation code you give prospective tenants separately.
   - `ACCEPT_ACKNOWLEDGMENTS=false` — keep disabled initially.
5. Deploy. Review the wording, print layout, and test using a staging domain and non-applicant test data. When you have finalized the criteria, change `POLICY.version`, set `ACCEPT_ACKNOWLEDGMENTS=true`, and **redeploy**. If the email settings are incomplete the server will continue to reject acknowledgment submissions.
6. Share the page with future applicants **at the time you provide access to the Zillow application**, not after. Every adult applicant should complete their own acknowledgment; Zillow's screening is separate.

### Environment variables

Copy [`.env.example`](.env.example) to `.env.local` for local development (the latter is gitignored).

`npm install` → `npm run dev` → open http://localhost:3000. Use `npm run typecheck` and `npm run build` to validate.

## How it works

- Server renders an editable published list of actual criteria and the acknowledgment wording substantially matching Texas Property Code § 92.3515(c).
- Applicant enters name/email, checks **I have read this**, and consents to an electronic acknowledgment and email receipt.
- `POST /api/acknowledge` checks the server's current criteria version, validates inputs, optionally checks an access code, then calls the Resend API server-side.
- One email is addressed to the applicant with **BCC** to the landlord and Tandra. Each recipient gets the full criteria and a confirmation record; recipient addresses are not exposed to applicants.
- On successful acceptance by Resend, the page displays the confirmation and unique receipt ID. Acceptance by the Resend API is **not proof of final delivery**; use the Resend dashboard/webhooks to verify delivery as needed.
- **No database is configured.** The durable records are the delivered emails and email-provider logs, subject to retention policies. For legally important records, export/store these receipts securely in an appropriate system. Do not consider the provider logs a permanent records archive.

## Security and privacy

- Resend API key and owner addresses never appear in browser JavaScript.
- The site opts out of search indexing, but `robots` instructions do not make a public website private.
- Applicant-facing email doesn't reveal the owners' emails because it uses BCC.
- The app includes a honeypot, an origin check, data-size/format checks and basic server validation. A production deployment should add WAF/rate limiting; an access code can reduce casual misuse.
- Don't send applicant credit reports, social security numbers, bank statements, or other sensitive details using this form.
- Emails include a timestamp, IP address and user agent for audit purposes. Advise applicants of this collection and set a reasonable retention and deletion policy.

## Legal references

- [Texas Property Code § 92.3515](https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm#92.3515)
- [Vercel environment variables](https://vercel.com/kb/guide/how-to-add-vercel-environment-variables)
- [Resend / Vercel integration](https://resend.com/vercel)

This starter is not legal advice. Review it with qualified counsel before using it as your sole statutory notice mechanism.

## Private adverse-action workspace

Open `/admin/adverse-actions` and choose **Continue with Google**. Only verified
Google accounts matching `ADMIN_EMAILS` can sign in. If that variable is omitted,
the allowlist uses `LANDLORD_EMAIL` and `TANDRA_EMAIL`. Set exact email addresses
separated by commas; no wildcard domains or alias expansion are allowed. An
explicitly empty list denies everyone. The allowlist is rechecked on each request.

NextAuth handles OAuth state, PKCE, CSRF protection and encrypted session cookies.
Sessions last up to 8 hours. The shared password and its old cookies are no longer
accepted. Applicant records and send routes require authentication; writes also
require the same origin. Google is used only for identity (openid, email, profile),
not for Gmail or Drive access. No Google access or refresh tokens are stored in Neon.

### Google OAuth setup

Use a Google **Web application** client and register this exact production callback:
`https://back-acres-tenant-criteria.vercel.app/api/auth/callback/google`.
The JavaScript origin is `https://back-acres-tenant-criteria.vercel.app`.
For local Google sign-in, also register `http://localhost:3191/api/auth/callback/google`.
Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a random `NEXTAUTH_SECRET`, and
`NEXTAUTH_URL` in Vercel Production. Use the production origin for `NEXTAUTH_URL`;
locally use `http://localhost:3191`. Keep preview environments separate from production
credentials. If Google lists the app as Testing, approved accounts must also appear
in the OAuth consent screen's test-user list. Google may require the user to complete
consent; the automated tests do not grant consent on a user's behalf.

1. Enter the applicant, decision, sender contact and actual reasons in Tiptap.
2. Include all reporting agencies used. If a credit score influenced the decision,
   fill in the score, range, creation date, source and ordered key factors.
3. Save a version, preview it, confirm the recipient and click **Send notice**.

Every save inserts a new Neon record through Drizzle. Prior versions are never edited.
The stored snapshot includes the structured fields, exact email HTML and plain text.
Concurrent edits from an older version are rejected; open the latest version first.
Drafts may be incomplete, but sending validates the required fields. The disclosure
structure follows the [FTC landlord guidance](https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know).
This template does not decide eligibility or resolve late criteria disclosure/refund obligations.

Sending uses the existing `RESEND_API_KEY` and `FROM_EMAIL`. A database claim and
stable provider idempotency key prevent repeat sends of the same version. `accepted`
means Resend accepted the email, not that it reached the inbox. `sending` or `unknown`
after a failure requires checking Resend manually before creating another version;
there is no automatic retry that could send a duplicate legal notice. `rejected` means
the provider rejected the request. Review the provider result before saving a corrected
version and sending again. No delivery webhook is currently configured.

### Database and development

Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and the Google authentication variables only in ignored
`.env.local` / Vercel secrets. Never use `NEXT_PUBLIC_` for these values.
Use Node 22. Run `npm ci`, `npm run db:generate` after schema edits and
`npm run db:migrate` to apply the checked-in migration. Migration is a separate
explicit operation; builds do not mutate the database. These tables are additive.

`npm test` checks notice validation, safe rendering and sending failure/concurrency
behavior. For browser tests, start a development server on port 3191 with
`ADMIN_EMAILS=admin-test@example.invalid RESEND_API_KEY=test-no-email-delivery FROM_EMAIL=test@example.com npm run dev -- --port 3191`,
then run `ADMIN_EMAILS=admin-test@example.invalid npm run test:e2e`. Tests use headless installed Chrome and the configured
Neon database, create explicitly labeled test records, and remove those records.
The browser tests sign local fixture sessions with NEXTAUTH_SECRET; they exercise access enforcement, not a real Google consent round-trip. They do not send email. Production provider delivery still needs a deliberately
addressed test or an authorized real notice.

## Property-management workspace

`/admin` uses the same approved Google owner accounts. It manages properties,
applications, immutable lease templates/draft versions, payment requests, and
resident maintenance links. Public listings live at `/properties`; a published
property can accept applications at `/properties/<slug>/apply`.

Listings and applications use the shared selection criteria in `lib/policy.ts`;
property forms do not ask owners to duplicate them. Applications capture the
property/criteria snapshot and version presented at submission and reject stale
criteria versions.
Applicant identity and email are self-reported. Screening is arranged separately
with a provider such as SmartMove; this app never collects SSNs or orders reports.
Status updates do not email decisions. Maintenance forms show emergency contact
instructions, use revocable one-year private links, and do not reveal past tickets.
The owner must check the workspace for submissions; automatic email alerts and
attachments are not implemented.

The supplied Avail lease model is adapted as editable text in
`lib/leases/avail-template.ts`. The original PDF and extracted temporary files
stay outside Git. Explicit disclosures replace sample-specific assertions.
Generated leases remain drafts, with private PDF downloads and immutable saves;
e-signatures and the original PDF's separately listed enclosures are not included.

Apply migrations before publishing: `npm run db:migrate`. The provided lease model
was imported into the configured Neon database under template ID
`91268531-0000-4000-8000-000000000001`. On a new database, add the template through
the workspace or an explicit server-side seed.

Stripe Checkout is wired for one-time payments but remains unavailable without
STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Begin with sandbox/test values in
Vercel Production, stored as sensitive values. Configure the webhook endpoint
`/api/payments/webhook` for `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, and
`checkout.session.async_payment_failed`. Stripe-hosted payment methods are managed
in Stripe's Dashboard. Both secret and restricted live keys additionally require
PAYMENTS_LIVE_ENABLED=true; leave it false while testing.

One-time requests use Checkout. Fixed-term monthly rent schedules use Stripe
Billing and send-invoice collection, with hosted invoice payment pages and no
autopay. Subscribe the same endpoint to invoice.finalized, invoice.paid,
invoice.payment_failed, invoice.voided, invoice.marked_uncollectible, and
subscription_schedule.created/updated/canceled/completed/released. The webhook
retrieves current provider records to tolerate out-of-order notifications. See
`docs/stripe-integration-plan.md` for Billing, Invoicing, Tax, and live-payment
requirements. No live funds or real applicant emails were used in testing.

## Listing photos and publishing

Owner pages share a navbar (including Sign out) and section navigation. The
Photos & publishing section accepts JPEG/PNG/WebP photos, normalizes them to JPEG,
removes embedded metadata, and supports captions, cover selection, ordering,
removal, and restoration. Original upload bytes are not retained. Photo objects
are in a private Vercel Blob store; the app serves them publicly only while the
property is published and the photo is active. Draft and removed photos require
owner authentication. Removal is reversible and retains the stored file.

The connected Blob store provides BLOB_READ_WRITE_TOKEN as a server-only Vercel
variable. For local work, pull Development environment values into an ignored
file; never commit the token. Apply migration 0004 before this release.

Owners can download a ZIP containing listing text, ordered JPEG photos and
captions, then open their Zillow Rental Manager, Avail and Apartments.com
accounts to finish publishing. Status is manually confirmed by the owner;
changed content is flagged for updating. This does **not** automatically post or
synchronize external listings. A provider-approved feed/API connection is still
required for automated syndication. Coverage references, verified October 17,
2026:

- https://www.zillow.com/rentals-network/
- https://www.realtor.com/landlords/list-rental-property
- https://www.apartments.com/rental-manager

The photo browser integration test requires the listing-photo Blob token. It
uploads temporary fixtures, checks privacy and export, and removes only those
fixtures and objects afterward.

Adverse-action notices open in a searchable list with one row per document and
its latest version/status. Each row links to `/admin/adverse-actions/{documentId}`;
that editor shows only the selected document's immutable version history. New
notices use `/admin/adverse-actions/new`. List filters apply to the latest
version; an earlier accepted version is flagged separately. Resend acceptance
continues to mean provider acceptance, not confirmed inbox delivery.

### Automatic ACH rent payments

In Payments, choose **Automatic ACH**, set a future first payment date (day 1–28), amount, and fixed installment count. Copy the private tenant enrollment link. The payer reviews the exact terms, verifies their US bank account in Stripe-hosted Checkout, and accepts Stripe's mandate. Only a verified SetupIntent webhook starts a charge-automatically subscription schedule; no owner-entered bank details or automatic conversion of manual invoices. A missed start date requires canceling and creating a new enrollment. The private page also lets the payer revoke future debits; cancellation does not reverse payments already initiated or cancel the lease. To change banks, cancel and create a fresh enrollment. Treat enrollment links as confidential bearer credentials.

The configured Stripe sandbox remains test-only. Live collection requires a live restricted key with the required Billing, Checkout, Customer, Product, SetupIntent, Mandate, PaymentMethod and read-payment permissions, ACH enabled in Stripe, the matching live webhook secret, and deliberate PAYMENTS_LIVE_ENABLED=true activation. No live financial settings are changed by deployment. Required additional webhook events: setup_intent.succeeded, setup_intent.requires_action, setup_intent.setup_failed, setup_intent.canceled, mandate.updated, payment_intent.processing, payment_intent.succeeded, payment_intent.payment_failed, charge.failed, charge.dispute.created, charge.dispute.closed, charge.refunded. Retain all existing invoice, subscription_schedule and checkout events.

Invoice reconciliation reads current Stripe payment state: ACH processing is not paid or failed; failures, refunds and disputes remain visible even after an earlier paid event. A revoked mandate stops future schedules. Provider timeouts during enrollment require owner review rather than an automatic duplicate. Stripe supplies bank mandate/verification communications; confirm live email and failed-payment retry settings in Stripe before collecting real rent.

### Guided lease preparation

The Leases workspace opens a guided flow using the supplied Avail document by default. It fills the property address and rent, supports choosing an existing applicant, groups people, payment terms and disclosures into separate steps, and presents a readable document before saving. Draft versions store their entered values so they can reopen for revision; older drafts without values remain editable as documents. Switching workspace sections preserves the in-progress form for the current page session.

Lease wording changes live in a separate Tiptap editor. Automatic details appear as named inline chips and are inserted from a picker; owners do not author template syntax. Saving wording creates a new immutable document. The stored text format remains compatible with existing generation and PDF export. Apply migration 0007 before deploying.

### Removing workspace items

Properties, applications, lease documents and complete lease version families,
payment requests, rent schedules, resident links, maintenance requests, and
adverse-action notice families have a **Remove** action. Photos retain their
existing remove/restore controls. **Removed items** in the sidebar restores
records without destroying source data, references, or delivery/payment evidence.
Apply migration `0008` before deploying this release.

Removing a property unpublishes its listing, closes applications, and revokes
resident links. Related records stay in their own sections. Restored properties
stay unpublished and links stay revoked. External listing sites must be updated
separately. Active rent schedules block property removal; schedule removal first
stops future payments, and open payment requests are canceled before removal.
Pending payments must reconcile before removal. Restoring payment records never
restarts collection or refunds a payment.
