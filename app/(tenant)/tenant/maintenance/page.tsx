import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ManagementShell } from "@/components/management/shell";
import { MaintenanceRequestList } from "@/components/tenant/maintenance-requests";
import { TenantNavigation } from "@/components/tenant/navigation";
import { TenantNotConnected } from "@/components/tenant/not-connected";
import { TenantRequestForm } from "@/components/tenant/request-form";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantAuthReady } from "@/lib/tenant/config";
import { accountLabel } from "@/lib/tenant/leases";
import { tenantMaintenanceRequests } from "@/lib/tenant/maintenance";
export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance | Back Acres tenant portal" };
export default async function TenantMaintenance() {
  if (!tenantAuthReady()) {
    redirect("/tenant");
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
        accessRows.map(async (access) => {
          const [[property], requests] = await Promise.all([
            db()
              .select()
              .from(properties)
              .where(eq(properties.id, access.propertyId)),
            tenantMaintenanceRequests(access.residentLinkId),
          ]);
          const name = property?.data.name ?? "Your rental";
          return (
            <section
              aria-label={`${name} maintenance`}
              className="tenant-tenancy"
              key={access.id}
            >
              <header className="tenant-property-header">
                <h2>{name}</h2>
                <p>{property?.data.address}</p>
              </header>
              <div className="tenant-maintenance-grid">
                <section
                  aria-label={`New request for ${name}`}
                  className="tenant-panel"
                >
                  <h3>New maintenance request</h3>
                  <TenantRequestForm
                    contact={property?.data.contact}
                    email={email}
                    id={access.id}
                    name={access.name}
                    phone={access.phone}
                  />
                </section>
                <aside
                  aria-label={`${name} request history`}
                  className="tenant-aside"
                >
                  <h3>Your requests</h3>
                  <MaintenanceRequestList requests={requests} />
                  <dl className="tenant-contact">
                    <dt>Property contact</dt>
                    <dd>{property?.data.contact ?? "Back Acres Rentals"}</dd>
                  </dl>
                </aside>
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
        We couldn’t load your maintenance requests. Please refresh or contact
        Back Acres Rentals.
      </p>
    );
  }
  return (
    <ManagementShell title="Maintenance">
      <TenantNavigation />
      {content}
    </ManagementShell>
  );
}
