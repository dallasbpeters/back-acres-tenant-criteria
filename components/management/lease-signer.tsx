// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
const pattern1 = /filename="([^"]+)"/;

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const LeaseSignaturePad = dynamic(
  () => import("./lease-signature-pad").then((m) => m.LeaseSignaturePad),
  { loading: () => <p>Loading signature pad…</p>, ssr: false }
);
interface Record {
  body?: string;
  brandName: string;
  consent?: string;
  consentVersion?: string;
  contact?: string;
  declinedAt?: string;
  documentHash?: string;
  email: string;
  finalHash?: string;
  name: string;
  signedAt?: string;
  status?: string;
  verified: boolean;
}
export function LeaseSigner({ token }: { token: string }) {
  const [record, setRecord] = useState<Record | null>(null),
    [key, setKey] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [signature, setSignature] = useState(""),
    [consent, setConsent] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [withdrawn, setWithdrawn] = useState(false);
  const endpoint = `/api/lease-signing/${token}`;
  const contact = record?.contact || record?.brandName || "Back Acres Rentals";
  const load = useCallback(
    async (session = key) => {
      const r = await fetch(endpoint, {
          cache: "no-store",
          headers: session ? { Authorization: `Bearer ${session}` } : {},
        }),
        data = await r.json();
      if (!r.ok) {
        throw new Error(data.error);
      }
      setRecord(data);
    },
    [endpoint, key]
  );

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(endpoint, {
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          method: "POST",
        }),
        data = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          setKey("");
          setDownloaded(false);
          setSignature("");
          setConsent(false);
          await load("");
        }
        throw new Error(data.error);
      }
      const { action } = body as { action: string };
      if (action === "verify") {
        setKey(data.session);
        setCode("");
        await load(data.session);
      } else if (action === "code") {
        setMessage(
          "Check your email for a six-digit code. It expires in 10 minutes."
        );
      } else if (action === "withdraw") {
        setWithdrawn(true);
      } else {
        setSignature("");
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${endpoint}?format=pdf`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) {
        const data = await r.json();
        if (r.status === 401) {
          setKey("");
          setDownloaded(false);
          setSignature("");
          setConsent(false);
          await load("");
        }
        throw new Error(data.error);
      }
      const url = URL.createObjectURL(await r.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download =
        r.headers.get("Content-Disposition")?.match(pattern1)?.[1] ??
        "lease.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const resolveResult1 = () => {
    const resolveResult2 = () => {
      if (!record) {
        return null;
      }
      if (record.signedAt) {
        return (
          <p role="status">
            Your signature was recorded at{" "}
            {new Date(record.signedAt).toISOString()} (UTC).{" "}
            {record.status === "completed"
              ? "All required signatures are complete. Save your signed copy above."
              : "Waiting for the other required signatures. Return here and verify your email again to download the completed copy."}
          </p>
        );
      }
      if (record.declinedAt) {
        return (
          <p>
            Electronic signing was declined. Contact {contact} for a paper copy.
          </p>
        );
      }
      return (
        <>
          <p>
            Review the full lease below and download the PDF before signing. It
            includes the precise document this signature will be attached to.
            Use a browser and PDF reader that let you save or print a copy.
          </p>
          <pre className="lease-signing-document">{record.body}</pre>
          <form
            onSubmit={(e) => {
              if (!record) {
                return;
              }
              e.preventDefault();
              act({
                action: "sign",
                consent,
                consentVersion: record.consentVersion,
                documentHash: record.documentHash,
                name,
                signature,
              });
            }}
          >
            <label className="field">
              Confirm your full legal name
              <input
                autoComplete="name"
                maxLength={150}
                onChange={(e) => setName(e.target.value)}
                required
                value={name}
              />
            </label>
            <LeaseSignaturePad
              disabled={busy || !downloaded}
              onChange={setSignature}
            />
            {!downloaded && (
              <p className="small-note">
                Download the lease PDF above to enable signing.
              </p>
            )}
            <label className="check-row">
              <input
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
                required
                type="checkbox"
              />
              <span>{record.consent}</span>
            </label>
            <p className="small-note">
              By choosing “Sign this lease,” you are signing a contract. Review
              the terms before continuing. The website records the server’s UTC
              time and signature evidence; it does not provide notarization or
              government identity verification.
            </p>
            <Button
              disabled={busy || !downloaded || !signature || !consent}
              type="submit"
              variant="primary"
            >
              {busy ? "Recording…" : "Sign this lease"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                    `Decline electronic signing and ask ${contact} for a paper alternative?`
                  )
                ) {
                  act({ action: "withdraw" });
                }
              }}
              type="button"
            >
              Decline electronic signing
            </Button>
          </form>
        </>
      );
    };
    if (withdrawn) {
      return (
        <p role="status">
          Electronic signing declined. Contact {contact} for a paper copy or
          another way to sign. No signature was added.
        </p>
      );
    }
    if (record) {
      if (record.verified) {
        return (
          <>
            <h2>{record.brandName} · Residential lease</h2>
            <p>
              Signer: <strong>{record.name}</strong> · {record.email}
            </p>
            <Button
              disabled={busy}
              onClick={() => {
                download();
              }}
              type="submit"
            >
              {record.status === "completed"
                ? "Download signed lease & audit record"
                : "Download lease PDF"}
            </Button>
            <p className="document-fingerprint">
              Original PDF SHA-256: {record.documentHash}
            </p>
            {!!record.finalHash && (
              <p className="document-fingerprint">
                Signed PDF SHA-256: {record.finalHash}
              </p>
            )}
            <p className="small-note">Lease contact: {contact}</p>
            {resolveResult2()}
          </>
        );
      }
      return (
        <>
          <h2>{record.name}, verify your email</h2>
          <p>
            We’ll send a code to {record.email} before showing the lease or
            accepting a signature. This confirms access to your mailbox.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              act({ action: "code" });
            }}
            type="submit"
          >
            Email verification code
          </Button>
          <form
            className="signing-verification"
            onSubmit={(e) => {
              e.preventDefault();
              act({ action: "verify", code });
            }}
          >
            <label className="field">
              Six-digit email code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value)}
                pattern="[0-9]{6}"
                required
                value={code}
              />
            </label>
            <Button disabled={busy} type="submit" variant="primary">
              Verify and review lease
            </Button>
          </form>
          <p className="small-note">
            Need paper instead? Contact {contact}. This link is private; don’t
            forward it.
          </p>
        </>
      );
    }
    return (
      <p>
        {error
          ? `Contact ${contact} if this problem continues.`
          : "Loading signing request…"}
      </p>
    );
  };
  return (
    <section className="lease-signer">
      <p className="eyebrow">Private lease signing</p>
      {!!error && <p role="alert">{error}</p>}
      {!!message && <p role="status">{message}</p>}
      {resolveResult1()}
    </section>
  );
}
