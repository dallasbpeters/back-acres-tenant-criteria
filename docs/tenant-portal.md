# Tenant accounts and access

Clerk application: `app_3KrKpwigErHh0oyNYYLLEycS2qc` (Back Acres Properties).
The existing Google/NextAuth owner login is preserved. No passwords or owner
sessions are imported or converted. Clerk is scoped to tenant routes and never
grants owner access.

## Local setup

Clerk CLI is linked to the existing application. `clerk init --app
app_3KrKpwigErHh0oyNYYLLEycS2qc --no-skills --yes` configured development keys
in ignored `.env.local`. Never commit these keys. Run `npx -y clerk@latest doctor
--json` to check configuration without printing keys. Clerk skills are installed
for Codex globally.

Routes:

- `/sign-up`: register and verify account email.
- `/sign-in`: tenant sign-in; fallback destination `/tenant`.
- `/tenant`: shared payment history, automatic-payment status, maintenance
  submission/history, and property contact.
- `/tenant/settings`: Clerk account/security settings and property contact phone.
- `/admin/tenants`: owner-only property assignments and record sharing/removal.

Apply the checked-in Drizzle migration before using property assignments. The
migration adds `tenant_access`; it does not rewrite existing records.

## Access model

1. The tenant creates an account and verifies their email.
2. The owner selects the property and enters that verified email in Tenant access.
   The backend resolves exactly one verified Clerk user and stores its stable ID.
3. The owner explicitly selects invoices and rent schedules to share. Records
   must belong to that property. No records are shared based on email matching.
4. A dedicated internal resident-link record associates new portal maintenance
   requests with this assignment. Other tenants' requests are not included.
5. Owners can remove access. Revocation hides portal records on subsequent
   requests and revokes the assignment's internal resident link. Reassigning the
   same account/property restores access and replaces the shared record selection.
6. Changing a Clerk email does not change account ownership or grants. A deleted
   and recreated Clerk account has a new ID and needs a new owner-approved grant.

All tenant mutations require an active Clerk browser session, same origin, and a
current non-revoked property assignment. Client-supplied property IDs do not decide
where maintenance is stored. Removed properties/assignments fail closed. Owner
APIs continue to require the existing allowlisted Google session. Bank details
and Clerk secrets never reach browser application code. No Clerk Billing or
Organizations are enabled.

## Current boundaries

Payment history includes only explicitly shared records, filtered to the current
Stripe test/live environment. New invoices/schedules must be shared manually.
The portal shows automatic-payment status; existing private enrollment links
continue to handle authorization and stopping payments. Existing standalone
payment/maintenance/signing links keep their original access behavior; portal
revocation does not invalidate separately issued payment or signing links.
Lease document sharing and a Stripe customer-settings portal are not implemented
in this first account release. Notification preferences are not offered until
notification delivery uses them. Maintenance history shows the latest 100 requests
created through this tenancy; it does not infer ownership of older link-based requests.

## Production configuration

The canonical production origin is `https://backacresrentals.com`; `www` redirects
to it. Clerk's custom frontend is `https://clerk.backacresrentals.com`. Its frontend
and three email DNS records are verified, and its HTTPS certificate is issued.
The existing Vercel provider domain remains connected to the same instance.
Clerk CLI deployment status may still report the older provider domain; check the
custom domain's own dashboard status when diagnosing its DNS and certificate.

Google's existing OAuth client includes both the owner callback at
`https://backacresrentals.com/api/auth/callback/google` and the Clerk callback at
`https://clerk.backacresrentals.com/v1/oauth_callback`. Google consent homepage,
privacy, and terms URLs use the canonical origin. See `production-domain.md`.

Vercel deployments retrieve the application secret at runtime through
`getToken('clerk/back-acres', { subject: { type: 'app' } })`. This connector is
linked to development, preview, and production. `CLERK_SECRET_KEY` remains only
for ordinary local development. Set `CLERK_AUTH_SOURCE=vercel-connect` to opt into
Connect locally with a valid Vercel OIDC session. Connect failures never fall back
to a different environment credential.

Keep `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` configured for the matching instance.
The stored connector value must be an application secret (`sk_test_` or
`sk_live_`), not a publishable key (`pk_`) or account-level platform key (`ak_`).
The resolver rejects mismatched test/production public and secret keys. Keys from
different instances of the same mode must also be paired correctly in setup.
The connector has been verified through a fresh Vercel OIDC token exchange. It
returns a production secret accepted by Clerk (HTTP 200) for the selected
production instance `ins_3KrLzyvqOeZSjIkNJEXPvZiPyBz`. A single static
connector cannot supply different development and production keys automatically;
use separate connections if the deployments use different Clerk instances.

A separate randomly generated 32-byte `CLERK_ENCRYPTION_KEY` has been saved as a secret in each Vercel environment (development, preview, and production).
Clerk requires it to encrypt dynamic middleware credentials for server-side auth
helpers. Middleware forwards the credential only through Clerk's encrypted
server-request mechanism; no secret is passed to client components. Owner-only
Clerk lookups use an explicit server client backed by the same connection.
The public key remains public; server credentials and encryption keys must never
be committed. Missing tenant configuration shows a setup message; a configured
connection failure returns a generic uncached 503 on tenant routes. Owner login,
webhooks and public routes remain outside the Clerk middleware matcher.

Domain changes must review the owner Google callback, NEXTAUTH_URL, Stripe return
URLs/webhook, and shared URLs together. Existing independently issued links are
not invalidated by adding the custom domain.

## Verification

`npm run test:tenant` uses PGlite and mocked Clerk transport, applies real SQL
migrations and tests tenant isolation, owner/tenant separation, verified-email
resolution, cross-property grant rejection, removed properties, revocation,
settings, maintenance ownership, CSRF and provider failure. It makes no external
provider calls. It does not replace a real account sign-in and owner assignment check. Signed-out
redirects and the rendered Clerk forms are checked separately in the browser.
