import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ManagementShell } from "@/components/management/shell";
import { TenantNavigation } from "@/components/tenant/navigation";
import { PaymentHistory } from "@/components/tenant/payments";
import { TenantRequestForm } from "@/components/tenant/request-form";
import { db } from "@/lib/db";
import {
  invoices,
  maintenanceRequests,
  paymentHistory,
  properties,
  rentSchedules,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { paymentMode } from "@/lib/management/stripe";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantAuthReady } from "@/lib/tenant/config";
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
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ?? "";
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
              d
                .select()
                .from(maintenanceRequests)
                .where(
                  and(
                    eq(
                      maintenanceRequests.residentLinkId,
                      access.residentLinkId
                    ),
                    notRemoved(maintenanceRequests.id)
                  )
                )
                .orderBy(desc(maintenanceRequests.createdAt))
                .limit(100),
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
                    history={history}
                    payments={payments}
                    schedules={schedules}
                  />
                </section>
                <section
                  aria-label={`${property?.data.name} maintenance`}
                  id={index === 0 ? "maintenance" : undefined}
                >
                  <h3>Maintenance requests</h3>
                  {requests.length ? (
                    <ul className="tenant-request-list">
                      {requests.map((request) => (
                        <li key={request.id}>
                          <strong>{request.data.subject}</strong>
                          <span>
                            {request.status.replaceAll("_", " ")} ·{" "}
                            {request.createdAt.toLocaleDateString("en-US", {
                              timeZone: "America/Chicago",
                            })}
                          </span>
                          <p>{request.data.description}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No maintenance requests submitted through this account
                      yet.
                    </p>
                  )}
                  <details>
                    <summary>New maintenance request</summary>
                    <TenantRequestForm
                      email={email}
                      id={access.id}
                      name={access.name}
                      phone={access.phone}
                    />
                  </details>
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
          Your property owner needs to connect your tenancy before you can view
          payments or submit maintenance requests. Give the owner your verified
          account email.
        </p>
        <a href="/tenant/settings">Manage account settings</a>
      </section>
    );
  } catch {
    content = (
      <p role="alert">
        We couldn’t load your tenancy. Please refresh or contact the property
        owner. Your account settings are still available.
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
