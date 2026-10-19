/**
 * Shown when a signed-in account has no rental yet. Says what actually
 * connects it, and that the tenant does not need to send anything.
 */
export function TenantNotConnected({ signedInAs }: { signedInAs: string }) {
  return (
    <section className="tenant-empty tenant-not-connected">
      <h2>Your account isn’t connected to a rental yet</h2>
      <p>
        You’re signed in{signedInAs ? ` as ${signedInAs}` : ""}. Back Acres
        Rentals can see your account and connect it to your rental. You don’t
        need to send them anything.
      </p>
      <ul>
        <li>
          <strong>Got a lease link by text or email?</strong> Open it again.
          After you sign, choose <em>I already have an account</em>, and your
          rental connects right away.
        </li>
        <li>
          <strong>Signed up with the phone number on your lease?</strong> Your
          lease connects on its own. Refresh this page.
        </li>
      </ul>
      <p className="small-note">
        Once connected, your lease, payments, renters insurance and maintenance
        requests appear here.
      </p>
    </section>
  );
}
