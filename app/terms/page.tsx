import { LegalContact, LegalDocument } from "@/components/legal-document";
export const metadata = {
  description:
    "Terms for using the Back Acres Rental criteria, acknowledgment, and owner correspondence website.",
  title: "Terms of Service | Back Acres Rental",
};
export default function TermsPage() {
  return (
    <LegalDocument
      introduction="These terms describe use of the Back Acres Rental website for tenant-selection notices, applicant acknowledgments, and private owner correspondence."
      title="Terms of Service"
    >
      <section>
        <h2>01 · Purpose and scope</h2>
        <p>
          The property owner provides this website for the rental at 7800 Back
          Acres Rd, Amarillo, Texas. It publishes selection criteria, records
          applicants’ acknowledgments, and allows authorized administrators to
          prepare, save, and send applicant notices.
        </p>
        <p>
          These website terms are not a lease, rental application, offer to
          rent, or approval of an application. Rental decisions and any lease
          are handled separately. Viewing this website or receiving an email
          does not reserve the property.
        </p>
      </section>
      <section>
        <h2>02 · Applicant acknowledgments</h2>
        <p>
          Provide accurate information and submit an acknowledgment only for
          yourself. Each adult applicant should use their own name and email
          address. Review the displayed criteria and electronic-consent language
          before submitting.
        </p>
        <p>
          An acknowledgment records the submission at the time it is made and
          identifies the criteria version presented. It does not establish that
          criteria were provided on an earlier date. Keep the confirmation for
          your records. If you cannot use the electronic form, contact the
          property owner to arrange another way to receive and acknowledge the
          criteria.
        </p>
      </section>
      <section>
        <h2>03 · Private owner workspace</h2>
        <p>
          The owner workspace is limited to approved Google accounts. Protect
          your account and do not share your session or attempt to access
          another person’s account or records. Google sign-in confirms an
          identity; it does not grant access unless the property owner has
          approved the account.
        </p>
        <p>
          Administrators are responsible for the accuracy of applicant details,
          the actual decision and reasons, required reporting-agency or
          credit-score disclosures, and the selected recipient. Review the saved
          preview before sending. The editor is a correspondence tool and does
          not make housing decisions or determine whether a notice satisfies
          every requirement applicable to a particular situation.
        </p>
      </section>
      <section>
        <h2>04 · Saved versions and email delivery</h2>
        <p>
          Each save creates a separate version. Earlier versions are retained,
          and a send attempt is associated with the exact saved content. Editing
          later does not alter a previously sent email.
        </p>
        <p>
          A successful send response means the email provider accepted the
          message for sending; it does not guarantee inbox delivery or that the
          recipient read it. Administrators should check provider records when
          delivery is uncertain and use an appropriate alternate method when
          necessary. The system blocks repeated attempts for the same version to
          reduce duplicate notices.
        </p>
      </section>
      <section>
        <h2>Tenant accounts and property access</h2>
        <p>
          Create and use your own tenant account. Verify your email and keep
          your sign-in credentials private. The property owner must approve
          access and choose which payment records are shared. Account
          registration does not approve an application, establish a tenancy,
          change a lease, or authorize a payment. Payment status remains subject
          to confirmation by Stripe. Removing portal access does not cancel an
          existing payment authorization; use the enrollment controls or contact
          the owner to stop future debits.
        </p>
      </section>
      <section>
        <h2>05 · Appropriate use</h2>
        <p>
          Use the website only for legitimate rental-related communications and
          your own acknowledgment. Do not impersonate another person, submit
          knowingly false information, send unrelated or unlawful messages,
          attempt to bypass access controls, or interfere with the service.
        </p>
        <p>
          Do not place Social Security numbers, full financial account numbers,
          passwords, or unnecessary consumer-report details in free-text fields.
          The <a href="/privacy">Privacy Policy</a> describes the website’s
          information handling.
        </p>
      </section>
      <section>
        <h2>Automatic ACH rent payments</h2>
        <p>
          Automatic payments are optional and require the named payer’s explicit
          bank authorization and verification with Stripe. Review the exact
          amount, first debit date, monthly frequency, and payment count before
          authorizing. Bank debits may take several business days to settle. An
          initiated payment is not confirmed payment. Use the private enrollment
          page to stop future debits, or contact Back Acres Rentals. Stopping
          payments does not reverse debits already submitted or alter rent due
          under your lease. Changes to bank details or payment terms require a
          new enrollment. The enrollment page provides a downloadable copy of
          accepted payment terms; a copy is also queued for email. Keep it and
          the separate Stripe mandate.
        </p>
      </section>
      <section>
        <h2>06 · Rights and other agreements</h2>
        <p>
          Nothing in these website terms or an electronic acknowledgment is
          intended to waive rights provided by applicable housing,
          consumer-reporting, privacy, or other law. These terms do not
          determine whether an application fee or deposit must be refunded, cure
          an earlier failure to provide required criteria, or replace a notice
          required by law.
        </p>
        <p>
          Any lease, separate rental agreement, and legally required disclosures
          remain separate from these website terms. Use of Google or other
          external services is also subject to those providers’ applicable
          terms.
        </p>
      </section>
      <section>
        <h2>07 · Availability, changes, and contact</h2>
        <p>
          The website may be unavailable during maintenance or service
          interruptions. Contact Back Acres Rentals if you cannot submit an
          acknowledgment, need a copy of a record, or have a time-sensitive
          issue. Updated website terms will show a new effective date here;
          changing this page does not change a prior acknowledgment, saved
          notice, or signed lease.
        </p>
        <LegalContact />
      </section>
      <section>
        <h2>Property applications, maintenance, leases, and payments</h2>
        <p>
          An application is a request for consideration, not acceptance or a
          lease. Screening authorization and any screening charge are handled
          separately. Maintenance forms are not emergency services; contact the
          owner directly for urgent repairs and call 911 for immediate danger.
          Lease documents are drafts until reviewed and signed. Electronic
          signing is a separate flow tied to a frozen PDF version, individual
          email verification, explicit consent, and an audit record. Each signer
          must act for themselves; administrators must not sign for a tenant. A
          server timestamp records when this website accepted the signature; it
          is not notarization, an independent trusted timestamp, or a guarantee
          that a lease or its terms are enforceable. Signers may request paper
          or decline electronic signing before signing by contacting the
          landlord. Signed records and audit evidence are retained; a later edit
          creates a separate lease version and does not change what was signed.
          Paying a request does not by itself approve an application or execute
          a lease. Payment amounts are disclosed before checkout; contact the
          owner about errors or refunds. Bank payments may remain pending until
          the provider confirms success. These website terms do not alter lease
          obligations or waive rights under applicable law.
        </p>
      </section>
    </LegalDocument>
  );
}
