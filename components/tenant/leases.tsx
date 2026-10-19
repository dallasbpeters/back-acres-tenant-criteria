import { Button } from "@/components/ui/button";
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
      <h3>Leases</h3>
      {leases.length ? (
        <ul className="tenant-lease-list">
          {leases.map((lease) => (
            <li key={lease.id}>
              <p className="tenant-lease-title">Lease for {lease.tenantName}</p>
              <p className="small-note">
                Sent {date(lease.createdAt)} · {status(lease)}
              </p>
              <div className="tenant-lease-actions">
                {lease.status === "awaiting" && !lease.mySignedAt && (
                  <form
                    action={`/api/tenant/leases/${lease.id}/sign`}
                    method="post"
                  >
                    <Button type="submit" variant="primary">
                      Review and sign lease
                    </Button>
                  </form>
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
        <p>
          No leases yet. A lease appears here after {contact} sends it to your
          verified email address.
        </p>
      )}
    </>
  );
}
