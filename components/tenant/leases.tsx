import { SignLeaseButton } from "@/components/tenant/sign-lease-button";
import type { TenantLease } from "@/lib/tenant/leases";

const date = (value: Date) =>
  value.toLocaleDateString("en-US", { timeZone: "America/Chicago" });

function status(lease: TenantLease) {
  if (lease.status === "completed") {
    return "Signed by everyone";
  }
  const progress = `${lease.signed} of ${lease.signers} signatures`;
  return lease.mySignedAt
    ? `You signed ${date(lease.mySignedAt)} · ${progress}`
    : `Waiting for your signature · ${progress}`;
}

export function TenantLeaseList({
  contact = "Back Acres Rentals",
  leases,
}: {
  contact?: string;
  leases: TenantLease[];
}) {
  return (
    <>
      <header className="tenant-section-head">
        <h3>Leases</h3>
      </header>
      {leases.length ? (
        <ul className="tenant-lease-list">
          {leases.map((lease) => (
            <li className="tenant-row" key={lease.id}>
              <div className="tenant-row-text">
                <p className="tenant-lease-title">
                  Lease for {lease.tenantName}
                </p>
                <p className="small-note">
                  Sent {date(lease.createdAt)} · {status(lease)}
                </p>
              </div>
              <div className="tenant-lease-actions">
                {lease.status === "awaiting" && !lease.mySignedAt && (
                  <SignLeaseButton packetId={lease.id} />
                )}
                <a
                  className="property-details-link"
                  download
                  href={`/api/tenant/leases/${lease.id}`}
                >
                  {lease.status === "completed"
                    ? "Download signed lease (PDF)"
                    : "Download a copy (PDF)"}
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">
          No leases yet. When {contact} sends you a lease, it appears here.
        </p>
      )}
    </>
  );
}
