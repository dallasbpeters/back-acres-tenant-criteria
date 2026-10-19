"use client";
import { useCallback } from "react";

/**
 * Tenant-only parts of a signer: a mobile number for texting the link, and
 * whether the email matches a portal account.
 */
export function TenantContactExtras({
  account,
  onPhone,
  phone,
}: {
  /** true or false once the email was checked; undefined before. */
  account: boolean | undefined;
  onPhone: (phone: string) => void;
  phone: string;
}) {
  const change = useCallback(
    (e: { target: { value: string } }) => onPhone(e.target.value),
    [onPhone]
  );
  return (
    <>
      <label className="field">
        Mobile number (if no email)
        <input
          autoComplete="tel"
          inputMode="tel"
          onChange={change}
          placeholder="(806) 555-0123"
          type="tel"
          value={phone}
        />
        <span className="small-note">
          With a number, you text the signing link yourself from Messages. No
          email is needed.
        </span>
      </label>
      {account === false && (
        <p className="signer-warning" role="status">
          No tenant portal account uses this email. The lease email will include
          a portal invitation for it. If this renter already has a portal
          account with a different email, use that email so the lease appears in
          their portal.
        </p>
      )}
      {account === true && (
        <p className="small-note">
          Matches a tenant portal account. The lease will appear in that portal.
        </p>
      )}
    </>
  );
}
