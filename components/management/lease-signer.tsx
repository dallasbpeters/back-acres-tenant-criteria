// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
const pattern1 = /filename="([^"]+)"/;

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SignerPdfViewer = dynamic(
  () => import("./signer-pdf-viewer").then((m) => m.SignerPdfViewer),
  { loading: () => <p role="status">Loading the lease PDF…</p>, ssr: false }
);
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
    [name, setName] = useState(""),
    [signature, setSignature] = useState(""),
    [consent, setConsent] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [withdrawn, setWithdrawn] = useState(false);
  const endpoint = `/api/lease-signing/${token}`;
  // Keep the session for this tab only, so a reload keeps the signer's place.
  // It ends with the tab or when the server session expires.
  const storageKey = `lease-signing-session:${token}`;
  const remember = useCallback(
    (session: string) => {
      try {
        if (session) {
          sessionStorage.setItem(storageKey, session);
        } else {
          sessionStorage.removeItem(storageKey);
        }
      } catch {
        // Storage can be unavailable (private mode); signing still works.
      }
    },
    [storageKey]
  );
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        setKey(saved);
      }
    } catch {
      // Storage unavailable: the page opens a new session instead.
    }
  }, [storageKey]);
  const contact = record?.contact || record?.brandName || "Back Acres Rentals";
  const load = useCallback(
    async (session = key) => {
      const r = await fetch(endpoint, {
          cache: "no-store",
          headers: session ? { Authorization: `Bearer ${session}` } : {},
        }),
        data = await r.json();
      if (r.status === 401 && session) {
        // The saved session expired: forget it and open a new one.
        remember("");
        setKey("");
        return;
      }
      if (!r.ok) {
        throw new Error(data.error);
      }
      if (data.verified === false) {
        // The private link was emailed only to this signer, so opening it is
        // the email check. Start the signing session without a code.
        const opened = await fetch(endpoint, {
            body: JSON.stringify({ action: "open" }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }),
          result = await opened.json();
        if (!opened.ok) {
          setRecord(data);
          throw new Error(result.error);
        }
        remember(result.session);
        setKey(result.session);
        return;
      }
      setRecord(data);
    },
    [endpoint, key, remember]
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
          remember("");
          setKey("");
          setDownloaded(false);
          setSignature("");
          setConsent(false);
          await load("");
        }
        throw new Error(data.error);
      }
      const { action } = body as { action: string };
      if (action === "withdraw") {
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
          remember("");
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
              : "Waiting for the other required signatures. Return here or open your tenant portal to download the completed copy."}
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
            Read the lease below. It is the exact PDF your signature will be
            attached to. You can also download a copy to save or print.
          </p>
          <SignerPdfViewer
            authorization={key}
            endpoint={endpoint}
            onViewed={() => setDownloaded(true)}
          />
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
                The lease PDF must finish loading above before you can sign.
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
          <h2>{record.name}, opening your lease</h2>
          <p role="status">Opening your lease…</p>
          {!!error && (
            <Button
              onClick={() => {
                setError("");
                load("").catch((e) => setError(e.message));
              }}
              type="button"
              variant="primary"
            >
              Try again
            </Button>
          )}
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
