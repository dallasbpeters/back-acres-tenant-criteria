# Production domain

The production origin is **https://back-acres.vercel.app**. The retired
`back-acres-tenant-criteria.vercel.app` address is no longer configured.

Production `NEXTAUTH_URL` in Vercel must equal the new origin. It is the canonical
origin for Google authentication, generated lease invitations, maintenance links,
and Stripe Checkout/ACH return URLs. Environment changes require a new deployment.

The existing Google OAuth client in the `back-acres` Cloud project uses:

- Authorized JavaScript origin: `https://back-acres.vercel.app`
- Authorized redirect URI: `https://back-acres.vercel.app/api/auth/callback/google`

The retired origin and callback were removed on October 18, 2026. OAuth client
credentials, owner allowlists, PKCE/state checks, and mailbox-verification rules
are unchanged. Users must sign in on the new domain; cookies from the retired
host do not transfer.

The existing Stripe **test-mode** webhook was moved to:
`https://back-acres.vercel.app/api/payments/webhook`. Its ID, enabled state, 25 event
subscriptions, API version, and signing secret are retained. This does not enable
live payments or create transactions.

Older emails, printed links, or bookmarks containing the retired hostname must
be replaced or reissued from the new domain. Do not restore the retired OAuth
redirect when troubleshooting the new deployment.
