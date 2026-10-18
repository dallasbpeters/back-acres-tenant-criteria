import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ManagementShell } from "@/components/management/shell";
import { MaintenanceRequestList } from "@/components/tenant/maintenance-requests";
import { TenantNavigation } from "@/components/tenant/navigation";
import { PaymentHistory } from "@/components/tenant/payments";
import { db } from "@/lib/db";
import {
  invoices,
  paymentHistory,
  properties,
  rentSchedules,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { paymentMode } from "@/lib/management/stripe";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantAuthReady } from "@/lib/tenant/config";
import { tenantMaintenanceRequests } from "@/lib/tenant/maintenance";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tenant portal | Back Acres" };
export default async function TenantPortal() {
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
    redirect("/sign-in");
  }
  const user = await currentUser();
  let content: ReactNode;
  try {
    const accessRows = await assignments(userId);
    content = accessRows.length ? (
      await Promise.all(
        accessRows.map(async (access, index) => {
          const d = db();
          const [propertyRows, payments, schedules, requests] =
            await Promise.all([
              d
                .select()
                .from(properties)
                .where(eq(properties.id, access.propertyId)),
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
          return (
            <section className="tenant-tenancy" key={access.id}>
              <h2>{property?.data.name}</h2>
              <p>{property?.data.address}</p>
              <div className="tenant-grid">
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
                  <h3>Recent maintenance requests</h3>
                  <MaintenanceRequestList requests={requests} />
                  <a
                    className="property-details-link"
                    href="/tenant/maintenance"
                  >
                    Submit or review maintenance requests
                  </a>
                  <p className="small-note">
                    Property contact: {property?.data.contact}
                  </p>
                </section>
              </div>
            </section>
          );
        })
      )
    ) : (
      <section className="tenant-empty">
        <h2>Your account is ready</h2>
        <p>
          Back Acres Rentals needs to connect your tenancy before you can view
          payments or submit maintenance requests. Send Back Acres Rentals your
          verified account email.
        </p>
        <a href="/tenant/settings">Manage account settings</a>
      </section>
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
      <p>Welcome{user?.firstName ? `, ${user.firstName}` : ""}.</p>
      {content}
    </ManagementShell>
  );
}
