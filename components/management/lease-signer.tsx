"use client";
import { Button } from "@/components/ui/button";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const LeaseSignaturePad = dynamic(
  () => import("./lease-signature-pad").then((m) => m.LeaseSignaturePad),
  { ssr: false, loading: () => <p>Loading signature pad…</p> },
);
type Record = {
  verified: boolean;
  name: string;
  email: string;
  brandName: string;
  body?: string;
  documentHash?: string;
  finalHash?: string;
  status?: string;
  signedAt?: string;
  declinedAt?: string;
  consent?: string;
  consentVersion?: string;
};
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
  async function load(session = key) {
    const r = await fetch(endpoint, {
        headers: session ? { Authorization: `Bearer ${session}` } : {},
        cache: "no-store",
      }),
      data = await r.json();
    if (!r.ok) throw Error(data.error);
    setRecord(data);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [token]);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify(body),
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
        throw Error(data.error);
      }
      const action = (body as { action: string }).action;
      if (action === "verify") {
        setKey(data.session);
        setCode("");
        await load(data.session);
      } else if (action === "code")
        setMessage(
          "Check your email for a six-digit code. It expires in 10 minutes.",
        );
      else if (action === "withdraw") setWithdrawn(true);
      else {
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
        throw Error(data.error);
      }
      const url = URL.createObjectURL(await r.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download =
        r.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "lease.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloaded(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="lease-signer">
      <p className="eyebrow">Private lease signing</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {withdrawn ? (
        <p role="status">
          Electronic signing declined. Contact your landlord for a paper copy or
          another way to sign. No signature was added.
        </p>
      ) : !record ? (
        <p>
          {error
            ? "Contact your landlord if this problem continues."
            : "Loading signing request…"}
        </p>
      ) : !record.verified ? (
        <>
          <h2>{record.name}, verify your email</h2>
          <p>
            We’ll send a code to {record.email} before showing the lease or
            accepting a signature. This confirms access to your mailbox.
          </p>
          <Button
            type="submit"
            disabled={busy}
            onClick={() => void act({ action: "code" })}
          >
            Email verification code
          </Button>
          <form
            className="signing-verification"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "verify", code });
            }}
          >
            <label className="field">
              Six-digit email code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                maxLength={6}
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              Verify and review lease
            </Button>
          </form>
          <p className="small-note">
            Need paper instead? Contact your landlord. This link is private;
            don’t forward it.
          </p>
        </>
      ) : (
        <>
          <h2>{record.brandName} · Residential lease</h2>
          <p>
            Signer: <strong>{record.name}</strong> · {record.email}
          </p>
          <Button type="submit" disabled={busy} onClick={() => void download()}>
            {record.status === "completed"
              ? "Download signed lease & audit record"
              : "Download lease PDF"}
          </Button>
          <p className="document-fingerprint">
            Original PDF SHA-256: {record.documentHash}
          </p>
          {record.finalHash && (
            <p className="document-fingerprint">
              Signed PDF SHA-256: {record.finalHash}
            </p>
          )}
          {record.signedAt ? (
            <p role="status">
              Your signature was recorded at{" "}
              {new Date(record.signedAt).toISOString()} (UTC).{" "}
              {record.status === "completed"
                ? "All required signatures are complete. Save your signed copy above."
                : "Waiting for the other required signatures. Return here and verify your email again to download the completed copy."}
            </p>
          ) : record.declinedAt ? (
            <p>
              Electronic signing was declined. Contact your landlord for a paper
              copy.
            </p>
          ) : (
            <>
              <p>
                Review the full lease below and download the PDF before signing.
                It includes the precise document this signature will be attached
                to. Use a browser and PDF reader that let you save or print a
                copy.
              </p>
              <pre className="lease-signing-document">{record.body}</pre>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({
                    action: "sign",
                    signature,
                    consent,
                    consentVersion: record.consentVersion,
                    documentHash: record.documentHash,
                    name,
                  });
                }}
              >
                <label className="field">
                  Confirm your full legal name
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={150}
                    autoComplete="name"
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
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                  />
                  <span>{record.consent}</span>
                </label>
                <p className="small-note">
                  By choosing “Sign this lease,” you are signing a contract.
                  Review the terms before continuing. The website records the
                  server’s UTC time and signature evidence; it does not provide
                  notarization or government identity verification.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || !downloaded || !signature || !consent}
                >
                  {busy ? "Recording…" : "Sign this lease"}
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Decline electronic signing and ask the landlord for a paper alternative?",
                      )
                    )
                      void act({ action: "withdraw" });
                  }}
                >
                  Decline electronic signing
                </Button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}
