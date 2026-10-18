interface TenantRequest {
  createdAt: Date;
  data: { description: string; subject: string };
  id: string;
  status: string;
}

export function MaintenanceRequestList({
  requests,
}: {
  requests: TenantRequest[];
}) {
  if (!requests.length) {
    return <p>No maintenance requests submitted through this account yet.</p>;
  }
  return (
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
  );
}
