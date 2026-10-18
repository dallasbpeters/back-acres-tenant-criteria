# Production domain

The canonical production origin is **https://backacresrentals.com**.
`https://www.backacresrentals.com` redirects to it with HTTP 308.
`https://back-acres.vercel.app` continues to serve the same Vercel project for
existing links. The retired `back-acres-tenant-criteria.vercel.app` is not served.

Production `NEXTAUTH_URL` equals the canonical origin. It controls owner Google
authentication, generated lease invitations, maintenance links, and Stripe
Checkout/ACH return URLs. Environment changes require a new deployment.

The existing Google OAuth client in the `back-acres` Cloud project includes:

- Authorized JavaScript origin: `https://backacresrentals.com`
- Owner redirect: `https://backacresrentals.com/api/auth/callback/google`
- Clerk redirect: `https://clerk.backacresrentals.com/v1/oauth_callback`

Google consent homepage, privacy policy and terms links use the canonical origin.
The existing callbacks are retained. Client credentials, owner allowlists,
PKCE/state checks and mailbox-verification rules are unchanged. Cookies from an
old hostname do not transfer; users sign in again on the new domain.

Clerk uses the same production instance and app-scoped Vercel Connect credential.
The public key points to `clerk.backacresrentals.com`. All four Clerk DNS CNAMEs
are verified and its certificate is issued. No credentials are stored here.

The existing Stripe **test-mode** webhook remains at
`https://back-acres.vercel.app/api/payments/webhook`, which still serves this
project. Its ID, enabled state, 25 event subscriptions, API version and signing
secret are retained. Adding the domain does not enable live payments or create
transactions. Do not redirect or remove the old host without migrating this
webhook and checking independently issued links first.
