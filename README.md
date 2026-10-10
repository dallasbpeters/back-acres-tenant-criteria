# Back Acres · Tenant Selection Criteria & Acknowledgment

A responsive, GitHub-ready Next.js application for `7800 Back Acres Rd, Amarillo, TX 79119`, designed for deployment on Vercel. Applicants can review tenant-selection criteria, acknowledge them electronically, and receive an emailed receipt. Copies are emailed privately to both property owners (the landlord and Tandra) through Resend.

**Status:** DRAFT. The app deliberately **refuses submissions** until the criteria have been finalized and all required email settings are configured.

## Important before publishing

1. Review and replace the **PROPOSED** text in [`lib/policy.ts`](lib/policy.ts) with your actual, consistently applied, pre-established tenant-selection criteria. The 3× rent income rule is a **suggested draft**, not a claimed current policy. In particular, decide credit/history and animal policies before activating.
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
