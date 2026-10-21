import { type GuideStep, StepList } from "@/components/guide/step-list";
import { OwnerFrame } from "@/components/management/owner-frame";
import { SectionCard } from "@/components/management/section-card";
import { OwnerSignIn } from "@/components/management/sign-in";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "How it works | Back Acres" };

const guideSections: { id: string; steps: GuideStep[]; title: string }[] = [
  {
    id: "guide-setup",
    steps: [
      {
        body: "Name, address, rent, deposit and contact. The rent and deposit fill in new leases.",
        href: "/admin#properties",
        linkLabel: "Open Properties",
        title: "Add the property",
      },
      {
        body: "Logo and colors used on the site, emails and lease PDFs.",
        href: "/admin#branding",
        linkLabel: "Open Branding",
        title: "Set your branding",
      },
      {
        body: "Photos and the public listing. Applicants apply from the listing; review them under Applications.",
        href: "/admin#publishing",
        linkLabel: "Open Photos & publishing",
        title: "Publish the listing",
      },
    ],
    title: "Set up",
  },
  {
    id: "guide-lease",
    steps: [
      {
        body: "Create a lease for the property. Check the terms, dates and amounts. Spots marked “Tenant initials: ____” become steps the tenant initials one by one.",
        href: "/admin#leases",
        linkLabel: "Open Leases",
        title: "Prepare the lease",
      },
      {
        body: "Choose Send lease, add each adult tenant by email or mobile number, then choose Sign as landlord and send. You sign first, on the lease itself.",
        title: "Sign as landlord",
      },
      {
        body: "Tenants with an email get their private link right after you sign. For a mobile number, open Signing status and choose Text signing link; Messages opens with the link filled in.",
        title: "Send each tenant their link",
      },
      {
        body: "The tenant reads the lease, initials each marked spot, and signs. You both get an email, and everyone gets the signed PDF when the last person signs.",
        title: "Tenant signs",
      },
    ],
    title: "Sign the lease",
  },
  {
    id: "guide-portal",
    steps: [
      {
        body: "After signing, the tenant chooses Create your portal account. The account is attached to the lease and the property automatically, whatever email or phone it uses.",
        title: "Tenant creates an account",
      },
      {
        body: "Every portal account is listed under Tenant access. Choose Connect for anyone not yet connected, or Rename to fix a name.",
        href: "/admin/tenants",
        linkLabel: "Open Tenant access",
        title: "Check Tenant access",
      },
    ],
    title: "Connect the tenant portal",
  },
  {
    id: "guide-money",
    steps: [
      {
        body: "When the lease is fully signed, its security and pet deposits are requested automatically, by bank transfer only. They appear in the tenant's portal with Pay now.",
        title: "Deposits",
      },
      {
        body: "Choose New rent schedule, pick the renter, and set the amount and first date. For automatic bank payments, the tenant chooses Set up automatic payments in their portal; nothing is debited until they connect and verify their bank.",
        href: "/admin#payments",
        linkLabel: "Open Payments",
        title: "Monthly rent",
      },
      {
        body: "Choose New payment request for anything else, such as a fee. Copy the link and send it, or let the tenant pay from their portal.",
        title: "One-time charges",
      },
      {
        body: "Payment activity shows every payment, failure and refund from Stripe.",
        href: "/admin/payment-history",
        linkLabel: "Open payment activity",
        title: "Track payments",
      },
    ],
    title: "Collect money",
  },
  {
    id: "guide-living",
    steps: [
      {
        body: "Tenants submit requests from the portal, marked urgent when needed. Update the status as work happens; the tenant sees it.",
        href: "/admin#maintenance",
        linkLabel: "Open Maintenance",
        title: "Maintenance requests",
      },
      {
        body: "Tenants upload proof of insurance. Accept it or ask for a new copy under Tenant access.",
        href: "/admin/tenants",
        linkLabel: "Review insurance",
        title: "Renters insurance",
      },
    ],
    title: "During the lease",
  },
];

/** The owner's walkthrough: from a listed home to rent coming in. */
export default async function GuidePage() {
  const signedIn = await authenticated();
  return (
    <OwnerFrame signedIn={signedIn} title="How it works">
      {signedIn ? (
        <div className="guide">
          <p className="guide-intro">
            Back Acres takes a home from listing to monthly rent. Each step
            below says what happens, what the tenant sees, and where to do it.
          </p>
          {guideSections.map((section, index) => (
            <SectionCard key={section.id} labelledBy={section.id}>
              <h2 id={section.id}>
                {index + 1}. {section.title}
              </h2>
              <StepList label={section.title} steps={section.steps} />
            </SectionCard>
          ))}
        </div>
      ) : (
        <OwnerSignIn />
      )}
    </OwnerFrame>
  );
}
