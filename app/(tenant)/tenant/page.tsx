import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ManagementShell } from "@/components/management/shell";
import { TenantGettingStarted } from "@/components/tenant/getting-started";
import { TenantInsurance } from "@/components/tenant/insurance";
import { TenantLeaseList } from "@/components/tenant/leases";
import { MaintenanceRequestList } from "@/components/tenant/maintenance-requests";
import { TenantNavigation } from "@/components/tenant/navigation";
import { TenantNotConnected } from "@/components/tenant/not-connected";
import { PaymentHistory } from "@/components/tenant/payments";
import { db } from "@/lib/db";
import {
  insuranceDocuments,
  invoices,
  paymentHistory,
  properties,
  rentSchedules,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { paymentMode } from "@/lib/management/stripe";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantAuthReady } from "@/lib/tenant/config";
import { claimTenantInvitations } from "@/lib/tenant/invitations";
import {
  claimLeaseSigner,
  claimLeaseSignersByEmail,
  claimLeaseSignersByPhone,
} from "@/lib/tenant/lease-claims";
import {
  accountLabel,
  tenantLeases,
  verifiedEmails,
  verifiedPhones,
} from "@/lib/tenant/leases";
import { tenantMaintenanceRequests } from "@/lib/tenant/maintenance";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tenant portal | Back Acres" };
export default async function TenantPortal({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; claimed?: string }>;
}) {
  const { claim, claimed } = await searchParams;
  if (!tenantAuthReady()) {
    return (
      <ManagementShell title="Tenant portal">
        <p>
          Tenant sign-in is being configured. Existing payment and maintenance
          links still work.
        </p>
      </ManagementShell>
    );
  }
  const userId = await tenantIdentity();
  if (!userId) {
    redirect(
      claim
        ? `/sign-in?redirect_url=${encodeURIComponent(`/tenant?claim=${claim}`)}`
        : "/sign-in"
    );
  }
  if (claim) {
    // A code from the signing page attaches this account to that lease.
    const ok = await claimLeaseSigner(userId, claim).catch(() => false);
    redirect(ok ? "/tenant?claimed=1" : "/tenant?claimed=0");
  }
  const user = await currentUser();
  let content: ReactNode;
  try {
    const emails = verifiedEmails(user);
    // Owner invitations wait for this verified email; apply them first.
    await claimTenantInvitations(userId, emails);
    // Leases sent to this account's verified mobile number attach here.
    await claimLeaseSignersByPhone(userId, verifiedPhones(user));
    // Keep email-matched leases here even if the account email changes.
    await claimLeaseSignersByEmail(userId, emails);
    const accessRows = await assignments(userId);
    content = accessRows.length ? (
      await Promise.all(
        accessRows.map(async (access, index) => {
          const {
            history,
            insurance,
            leases,
            payments,
            property,
            requests,
            schedules,
          } = await tenancyRecords(access, emails);
          return (
            <section className="tenant-tenancy" key={access.id}>
              <header className="tenant-property-header">
                <h2>{property?.data.name}</h2>
                <p>
                  {property?.data.address}
                  {property?.data.contact
                    ? ` · Contact: ${property.data.contact}`
                    : ""}
                </p>
              </header>
              <TenantGettingStarted
                insurance={insurance}
                leases={leases}
                payments={payments}
                schedules={schedules}
              />
              <section
                aria-label={`${property?.data.name} leases`}
                className="tenant-section"
                id={index === 0 ? "leases" : undefined}
              >
                <TenantLeaseList
                  contact={property?.data.contact}
                  leases={leases}
                />
              </section>
              <section
                aria-label={`${property?.data.name} renters insurance`}
                className="tenant-section"
                id={index === 0 ? "insurance" : undefined}
              >
                <TenantInsurance
                  accessId={access.id}
                  documents={insurance.map((document) => ({
                    carrier: document.carrier,
                    createdAt: document.createdAt.toISOString(),
                    endsOn: document.endsOn,
                    fileName: document.fileName,
                    id: document.id,
                    policyNumber: document.policyNumber,
                    reviewNote: document.reviewNote,
                    startsOn: document.startsOn,
                    status: document.status,
                  }))}
                />
              </section>
              <div className="tenant-grid tenant-section">
                <section
                  aria-label={`${property?.data.name} payments`}
                  id={index === 0 ? "payments" : undefined}
                >
                  <PaymentHistory
                    contact={property?.data.contact}
                    history={history}
                    payments={payments}
                    schedules={schedules}
                  />
                </section>
                <section
                  aria-label={`${property?.data.name} maintenance`}
                  id={index === 0 ? "maintenance" : undefined}
                >
                  <header className="tenant-section-head">
                    <h3>Maintenance</h3>
                    <a
                      className="property-details-link"
                      href="/tenant/maintenance"
                    >
                      Submit or review requests
                    </a>
                  </header>
                  <MaintenanceRequestList requests={requests} />
                </section>
              </div>
            </section>
          );
        })
      )
    ) : (
      <TenantNotConnected signedInAs={accountLabel(user)} />
    );
  } catch {
    content = (
      <p role="alert">
        We couldn’t load your tenancy. Please refresh or contact Back Acres
        Rentals. Your account settings are still available.
      </p>
    );
  }
  return (
    <ManagementShell title="Tenant portal">
      <TenantNavigation />
      {claimed === "1" && (
        <p className="tenant-notice" role="status">
          Your lease was added to this account.
        </p>
      )}
      {claimed === "0" && (
        <p className="tenant-notice" role="alert">
          That lease link has expired or was already used. Open your signing
          link again, or ask the property owner to connect your account.
        </p>
      )}
      <p className="tenant-welcome">
        Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
      </p>
      {content}
    </ManagementShell>
  );
}

type TenantAssignment = Awaited<ReturnType<typeof assignments>>[number];

/** Everything one tenancy shows, loaded only through the owner's grants. */
async function tenancyRecords(access: TenantAssignment, emails: string[]) {
  const d = db();
  const [propertyRows, payments, schedules, requests, leases, insurance] =
    await Promise.all([
      d.select().from(properties).where(eq(properties.id, access.propertyId)),
      access.invoiceIds.length
        ? d
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.propertyId, access.propertyId),
                inArray(invoices.id, access.invoiceIds),
                eq(invoices.mode, paymentMode()),
                notRemoved(invoices.id)
              )
            )
            .orderBy(desc(invoices.createdAt))
        : [],
      access.scheduleIds.length
        ? d
            .select()
            .from(rentSchedules)
            .where(
              and(
                eq(rentSchedules.propertyId, access.propertyId),
                inArray(rentSchedules.id, access.scheduleIds),
                eq(rentSchedules.mode, paymentMode()),
                notRemoved(rentSchedules.id)
              )
            )
            .orderBy(desc(rentSchedules.createdAt))
        : [],
      tenantMaintenanceRequests(access.residentLinkId, 3),
      tenantLeases(access.propertyId, emails, access.clerkUserId),
      d
        .select()
        .from(insuranceDocuments)
        .where(eq(insuranceDocuments.tenantAccessId, access.id))
        .orderBy(desc(insuranceDocuments.createdAt))
        .limit(10),
    ]);
  const [property] = propertyRows;
  // The history query uses the already-authorized invoice rows, never URL IDs.
  const history = payments.length
    ? await d
        .select()
        .from(paymentHistory)
        .where(
          inArray(
            paymentHistory.invoiceId,
            payments.map((payment) => payment.id)
          )
        )
        .orderBy(desc(paymentHistory.observedAt))
    : [];
  return {
    history,
    insurance,
    leases,
    payments,
    property,
    requests,
    schedules,
  };
}
