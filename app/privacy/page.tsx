import { LegalContact, LegalDocument } from "@/components/legal-document";
export const metadata = {
  description:
    "How the Back Acres Rental website handles applicant acknowledgments, owner sign-in, and applicant notices.",
  title: "Privacy Policy | Back Acres Rental",
};
export default function PrivacyPage() {
  return (
    <LegalDocument
      introduction="This policy explains how the Back Acres Rental website handles information when you review criteria, submit an acknowledgment, or use the private owner workspace."
      title="Privacy Policy"
    >
      <section>
        <h2>01 · Information this website handles</h2>
        <ul>
          <li>
            <strong>Applicant acknowledgments.</strong> Your name, email
            address, acknowledgment and electronic-consent selections, the
            criteria version, a receipt identifier, submission time, IP address,
            and browser information. The receipt also identifies the criteria
            with a document hash.
          </li>
          <li>
            <strong>Owner sign-in.</strong> When an administrator uses Google
            sign-in, Google provides basic identity information, including an
            account identifier, name, email address, email-verification status,
            and, when available, a profile image. This information establishes
            the administrator’s session and checks approved access.
          </li>
          <li>
            <strong>Applicant notices.</strong> Authorized administrators enter
            applicant contact information, the property and decision, reasons,
            reporting-agency details, and any applicable credit-score
            disclosures. Saved versions include the notice content and creation
            time. Sending records include the attempt status, provider email
            identifier when available, and acceptance time.
          </li>
          <li>
            <strong>Property operations.</strong> Applications include contact
            details, self-reported income and housing history, requested move-in
            dates, and criteria acknowledgments. Maintenance requests include
            contact details, repair descriptions, and access notes. Owners store
            lease templates and draft versions. Payment requests store payer
            contact information, amounts, due dates, status, and Stripe checkout
            references. Private resident and payment links should only be shared
            with their intended recipients.
          </li>
          <li>
            <strong>Listing photos and publishing.</strong> Owners upload
            property photos and captions. Published listings show active photos
            publicly. Draft and removed photos require owner access. Downloads
            let owners share listing text and photos with their selected listing
            services; this website does not automatically submit them.
          </li>
          <li>
            <strong>Lease signatures and branding.</strong> We store the exact
            lease PDF, signer names and email addresses, signature images,
            consent wording and version, email-verification and signing
            timestamps, document fingerprints, and request IP address and
            browser details. Signing links and verification codes are stored as
            hashes, not plaintext. The completed PDF includes signatures and an
            audit record. Owners may upload PNG or SVG logos; logos are
            converted to PNG before display and are included in PDF snapshots.
            Signed records remain retained when a workspace item is removed so
            the agreement and audit history are not silently erased.
          </li>
          <li>
            <strong>Technical information.</strong> Hosting and email providers
            process request, security, and delivery information necessary to
            operate their services. This can include IP addresses, browser
            details, timestamps, and email delivery events.
          </li>
        </ul>
        <p>
          This website does not request identity-document uploads, Social
          Security numbers, bank account numbers, or payment-card information.
          Avoid including unnecessary sensitive information in notice reasons or
          support messages.
        </p>
      </section>
      <section>
        <h2>02 · How information is used</h2>
        <p>
          Information is used to record acknowledgments, provide receipts,
          prepare and send applicant correspondence, maintain version history,
          restrict owner access, troubleshoot problems, and support
          rental-related recordkeeping. The website does not automatically
          decide whether an applicant qualifies for housing.
        </p>
        <p>
          Google identity information is used for sign-in and access control.
          The Google connection requests only basic identity scopes; it does not
          request access to Gmail messages, Drive files, contacts, or calendars.
          Google passwords are entered with Google, not collected by this
          website.
        </p>
      </section>
      <section>
        <h2>03 · Storage and service providers</h2>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the website, processes server
            requests, and stores normalized listing photos in private Blob
            storage. Embedded photo metadata is removed during upload.
          </li>
          <li>
            <strong>Neon</strong> stores property records, applications,
            maintenance requests, lease drafts, frozen and signed lease PDFs,
            signature evidence, branding versions, payment records, activity
            history, and applicant-notice versions in a database.
          </li>
          <li>
            <strong>Resend</strong> processes email recipients, message content,
            and email delivery information. Acknowledgment receipts are sent to
            the applicant and privately copied to the property owners.
            Adverse-action notices are sent to the recipient confirmed by the
            administrator.
          </li>
          <li>
            <strong>Stripe</strong> processes payments in its hosted checkout
            when configured. Payer email, payment amounts, and request
            identifiers are shared with Stripe. Card and bank details are
            entered directly with Stripe, not stored by this application.
          </li>
          <li>
            <strong>Google</strong> authenticates approved administrators. Basic
            session information is held in an encrypted, HTTP-only browser
            cookie. Google access and refresh tokens are not stored in the
            notice database.
          </li>
        </ul>
        <p>
          Property owners can access records needed to administer the rental.
          Applicants receive their own email correspondence; they do not receive
          access to the private workspace or other applicants’ records.
          Information may also be disclosed when required by law or to address a
          security incident or legal claim.
        </p>
        <p>
          The website does not sell personal information or use Google identity
          information for advertising. Its use and transfer of Google user data
          follows the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements where applicable.
        </p>
      </section>
      <section>
        <h2>Automatic ACH payments</h2>
        <p>
          For automatic rent payments, we retain the agreed amount, dates,
          installment count, acceptance time, authorization text, and Stripe
          references for the bank setup and recurring schedule. Stripe collects
          and verifies bank details and provides the bank mandate. We do not
          store bank account or routing numbers. Private enrollment links permit
          bank setup and stopping future payments; share them only with the
          named payer.
        </p>
      </section>
      <section>
        <h2>04 · Cookies and security</h2>
        <p>
          Owner sign-in uses cookies for session management and protection
          against forged sign-in requests. The website does not include
          advertising or analytics trackers. Service providers may maintain
          their own operational logs.
        </p>
        <p>
          Private workspace access is restricted to approved Google accounts.
          Requests use HTTPS on the production site, and credentials remain on
          the server. These measures reduce risk, but no internet service can
          guarantee absolute security. Sign out when using a shared device.
        </p>
      </section>
      <section>
        <h2>05 · Retention, corrections, and deletion</h2>
        <p>
          Property operations records and saved notice versions remain in the
          database until removed through an administrative process; there is no
          automatic deletion schedule currently configured. Removed listing
          photos remain stored so owners can restore them; removal from a
          listing is not permanent deletion. Email receipts and notices may
          remain in the owners’ and recipients’ mailboxes and in
          service-provider records. Editing a notice creates a new version and
          does not erase earlier versions.
        </p>
        <p>
          You may contact the property owner to request access to, correction
          of, or deletion of information associated with you. The owner may need
          to verify your identity and retain information needed for applicable
          legal obligations, disputes, or rental recordkeeping. Deleting a
          website record does not recall emails already sent.
        </p>
        <p>
          Administrators may sign out to clear the active session and may manage
          the app’s connection through their{" "}
          <a href="https://myaccount.google.com/connections">
            Google Account connections
          </a>
          . Removing the Google connection does not delete applicant notices.
          Contact the owner to remove an approved account or address records
          separately.
        </p>
      </section>
      <section>
        <h2>06 · Questions and updates</h2>
        <LegalContact />
        <p>
          Updates to this policy will appear on this page with a revised
          effective date. This policy covers this website; rental-listing
          services, screening agencies, Google, and other providers have their
          own privacy policies.
        </p>
      </section>
    </LegalDocument>
  );
}
