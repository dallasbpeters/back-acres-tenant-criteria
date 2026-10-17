"use client";
import { useEffect, useState } from "react";
import { agencyPresets } from "@/lib/adverse/agencies";
import { signIn, signOut } from "next-auth/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  blankNotice,
  noticeSchema,
  renderNotice,
  sendErrors,
  type Notice,
  type RichNode,
} from "@/lib/adverse/notice";

type Version = {
  id: string;
  documentId: string;
  version: number;
  notice: Notice;
  html?: string;
  createdAt: string;
  status?: string | null;
  resendId?: string | null;
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}
function Reasons({
  value,
  onChange,
}: {
  value: RichNode;
  onChange: (value: RichNode) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        underline: false,
        trailingNode: false,
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Reasons for the decision",
        "aria-multiline": "true",
        class: "reasons-content",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode),
  });
  return (
    <div className="reasons-editor">
      <div
        className="editor-tools"
        role="toolbar"
        aria-label="Reason formatting"
      >
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().undo().run()}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().redo().run()}
        >
          Redo
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
export default function AdverseEditor({
  signedIn,
  loginError,
}: {
  signedIn: boolean;
  loginError?: string;
}) {
  const [authenticated, setAuthenticated] = useState(signedIn);
  const [notice, setNotice] = useState<Notice>(blankNotice);
  const [versions, setVersions] = useState<Version[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [current, setCurrent] = useState<Version | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dirty =
    !current ||
    JSON.stringify(noticeSchema.parse(current.notice)) !==
      JSON.stringify(noticeSchema.parse(notice));
  const errors = sendErrors(notice);
  const rendered = renderNotice(notice);
  async function refresh() {
    const data = await api("notices");
    setVersions(data.versions);
    setHasMore(data.versions.length === 200);
    return data.versions as Version[];
  }
  useEffect(() => {
    if (authenticated) refresh().catch((e) => setError(e.message));
  }, [authenticated]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty && (notice.applicantName || notice.applicantEmail)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, notice]);
  function change<K extends keyof Notice>(key: K, value: Notice[K]) {
    setNotice((n) => ({ ...n, [key]: value }));
    setConfirmed(false);
    setMessage("");
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  function load(v: Version | null) {
    if (
      dirty &&
      (notice.applicantName || notice.applicantEmail) &&
      !window.confirm("Discard your unsaved edits?")
    )
      return;
    setCurrent(v);
    setNotice(v ? v.notice : blankNotice());
    setEditorKey((k) => k + 1);
    setPreview(false);
    setConfirmed(false);
    setError("");
    setMessage("");
  }
  const field = (key: keyof Notice, label: string, type = "text") => (
    <label className="field">
      {label}
      <input
        type={type}
        value={String(notice[key])}
        onChange={(e) => change(key, e.target.value as never)}
        maxLength={key === "senderContact" ? 1000 : 300}
      />
    </label>
  );
  const status = (s?: string | null) =>
    s === "accepted"
      ? "Accepted by Resend"
      : s === "sending"
        ? "Sending / check Resend"
        : s === "unknown"
          ? "Uncertain / check Resend"
          : s === "rejected"
            ? "Rejected by Resend"
            : "Draft";
  if (!authenticated)
    return (
      <main className="admin-shell admin-login">
        <a href="/">Back Acres Rental</a>
        <p className="eyebrow">Private workspace</p>
        <h1>Adverse action notices</h1>
        <p>Sign in to prepare, save, and send applicant notices.</p>
        <p className="small-note">
          Use an approved Google account. Access is limited to the property’s
          administrators.
        </p>
        <button
          className="admin-primary"
          disabled={busy}
          onClick={() =>
            perform(async () => {
              await signIn("google", { callbackUrl: "/admin/adverse-actions" });
            })
          }
        >
          {busy ? "Connecting to Google…" : "Continue with Google"}
        </button>
        {(error || loginError) && (
          <p role="alert" className="form-error">
            {error ||
              (loginError === "AccessDenied"
                ? "This Google account is not approved for access. Choose an approved account or contact the property administrator."
                : "Google sign-in could not be completed. Try again or contact the property administrator.")}
          </p>
        )}
      </main>
    );
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <a href="/">Back Acres Rental</a>
          <p className="eyebrow">Private correspondence</p>
          <h1>Adverse action notices</h1>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            if (
              dirty &&
              notice.applicantName &&
              !confirm("Discard unsaved edits and sign out?")
            )
              return;
            perform(async () => {
              await signOut({ redirect: false });
              setAuthenticated(false);
              setVersions([]);
              setCurrent(null);
              setNotice(blankNotice());
            });
          }}
        >
          Sign out
        </button>
      </header>
      <div className="admin-workspace">
        <aside className="notice-history">
          <div className="admin-actions">
            <h2>Saved notices</h2>
            <button disabled={busy} onClick={() => load(null)}>
              New notice
            </button>
            <button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await refresh();
                })
              }
            >
              Refresh
            </button>
          </div>
          <p className="small-note">
            Every save creates a separate version. Load earlier versions below
            when available.
          </p>
          {versions.length === 0 && <p>No saved notices yet.</p>}
          {versions.map((v) => (
            <button
              disabled={busy}
              className="version-item"
              key={v.id}
              aria-current={current?.id === v.id ? "true" : undefined}
              onClick={() => load(v)}
            >
              <strong>{v.notice.applicantName || "Untitled notice"}</strong>
              <span>
                Version {v.version} · {status(v.status)}
              </span>
              <span>{new Date(v.createdAt).toLocaleString()}</span>
            </button>
          ))}
          {hasMore && (
            <button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  const data = await api(`notices?offset=${versions.length}`);
                  setVersions((v) => [...v, ...data.versions]);
                  setHasMore(data.versions.length === 200);
                })
              }
            >
              Load earlier versions
            </button>
          )}
        </aside>
        <div className="notice-main">
          <div className="admin-actions">
            <p className="eyebrow">
              {current ? `Version ${current.version}` : "New notice"}
              {dirty ? " · Unsaved edits" : " · Saved"}
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setPreview(!preview);
                setConfirmed(false);
              }}
            >
              {preview ? "Edit notice" : "Preview notice"}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="admin-message" role="status">
              {message}
            </p>
          )}
          {preview ? (
            <article
              className="notice-preview"
              aria-label="Notice preview"
              dangerouslySetInnerHTML={{
                __html: !dirty && current?.html ? current.html : rendered.html,
              }}
            />
          ) : (
            <fieldset className="notice-fields" disabled={busy}>
              <section>
                <h2>01 · Applicant and decision</h2>
                <div className="fields">
                  {field("applicantName", "Applicant full name")}
                  {field("applicantEmail", "Applicant email", "email")}
                  {field("noticeDate", "Notice date", "date")}
                  {field("property", "Property address")}
                  {field("senderName", "Sender name")}
                  {field("senderContact", "Sender contact information")}
                  <label className="field">
                    Action taken
                    <select
                      value={notice.action}
                      onChange={(e) =>
                        change("action", e.target.value as Notice["action"])
                      }
                    >
                      {[
                        "Application denied",
                        "Co-signer required",
                        "Higher security deposit required",
                        "Higher rent required",
                        "Other",
                      ].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  Decision details or required terms
                  <textarea
                    value={notice.actionDetails}
                    maxLength={2000}
                    onChange={(e) => change("actionDetails", e.target.value)}
                  />
                </label>
              </section>
              <section>
                <h2>02 · Reasons for the decision</h2>
                <p className="section-intro">
                  Describe the actual reasons for this applicant. Avoid
                  including Social Security numbers or full account numbers.
                </p>
                <Reasons
                  key={editorKey}
                  value={notice.reasons}
                  onChange={(value) => change("reasons", value)}
                />
              </section>
              <section>
                <h2>03 · Consumer report disclosures</h2>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={notice.reportUsed}
                    onChange={(e) => {
                      change("reportUsed", e.target.checked);
                      if (!e.target.checked) change("scoreUsed", false);
                    }}
                  />
                  A consumer report influenced this decision, in whole or in
                  part.
                </label>
                {notice.reportUsed && (
                  <>
                    <p className="section-intro">
                      Select each agency whose report influenced the decision.
                      Its name, mailing address, and toll-free number fill in automatically.
                      You can edit the details if your report lists a different contact.
                    </p>
                    {notice.agencies.map((a, i) => (
                      <div className="agency-fields" key={i}>
                        <h3>Reporting agency {i + 1}</h3>
                        <label className="field">
                          Choose reporting agency {i + 1}
                          <select
                            aria-label={`Choose reporting agency ${i + 1}`}
                            value={agencyPresets.find((preset) => preset.name === a.name && preset.address === a.address && preset.phone === a.phone)?.id ?? ""}
                            onChange={(e) => {
                              const preset = agencyPresets.find((item) => item.id === e.target.value);
                              if (!preset) return;
                              const { name, address, phone } = preset;
                              change("agencies", notice.agencies.map((row, index) => index === i ? { name, address, phone } : row));
                            }}
                          >
                            <option value="">Choose an agency or enter custom details</option>
                            {agencyPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                          </select>
                        </label>
                        <div className="fields">
                          {(["name", "address", "phone"] as const).map((k) => (
                            <label className="field" key={k}>
                              {k === "name"
                                ? "Agency name"
                                : k === "address"
                                  ? "Mailing address"
                                  : "Phone / toll-free number"}
                              <input
                                value={a[k]}
                                maxLength={k === "address" ? 1000 : 300}
                                onChange={(e) =>
                                  change(
                                    "agencies",
                                    notice.agencies.map((row, index) =>
                                      index === i
                                        ? { ...row, [k]: e.target.value }
                                        : row,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                        {notice.agencies.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              change(
                                "agencies",
                                notice.agencies.filter(
                                  (_, index) => index !== i,
                                ),
                              )
                            }
                          >
                            Remove agency {i + 1}
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={notice.agencies.length >= 10}
                      onClick={() =>
                        change("agencies", [
                          ...notice.agencies,
                          { name: "", address: "", phone: "" },
                        ])
                      }
                    >
                      Add reporting agency
                    </button>
                    <p className="small-note">
                      The notice automatically includes the agency’s
                      non-involvement in the decision, the right to dispute, and
                      the right to request a free report within 60 days.
                    </p>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={notice.scoreUsed}
                        onChange={(e) => change("scoreUsed", e.target.checked)}
                      />
                      A numerical credit score was used in this decision.
                    </label>
                    {notice.scoreUsed && (
                      <div className="score-fields">
                        <div className="fields">
                          {field("score", "Credit score", "number")}
                          {field("scoreMin", "Lowest possible score", "number")}
                          {field(
                            "scoreMax",
                            "Highest possible score",
                            "number",
                          )}
                          {field("scoreDate", "Date score was created", "date")}
                          {field("scoreSource", "Score source")}
                        </div>
                        <label className="field">
                          Key factors affecting the score, in order of
                          importance
                          <textarea
                            value={notice.scoreFactors}
                            maxLength={3000}
                            onChange={(e) =>
                              change("scoreFactors", e.target.value)
                            }
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}
              </section>
            </fieldset>
          )}
          <section className="notice-send">
            <div className="admin-actions">
              <button
                className="admin-primary"
                disabled={busy || !dirty}
                onClick={() =>
                  perform(async () => {
                    const result = await api("notices", "POST", {
                      notice,
                      parentId: current?.id || null,
                      requestId: crypto.randomUUID(),
                    });
                    setCurrent(result.version);
                    await refresh();
                    setConfirmed(false);
                    setMessage(`Version ${result.version.version} saved.`);
                  })
                }
              >
                {busy ? "Working…" : "Save new version"}
              </button>
              {preview && (
                <button onClick={() => window.print()}>Print notice</button>
              )}
            </div>
            {errors.length > 0 && (
              <details>
                <summary>
                  {errors.length} item{errors.length !== 1 ? "s" : ""} to
                  complete before sending
                </summary>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            {current?.status && (
              <p>
                {status(current.status)}
                {current.resendId ? ` · Email ID: ${current.resendId}` : ""}
              </p>
            )}
            {preview && (
              <>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={
                      dirty || errors.length > 0 || !!current?.status || busy
                    }
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I reviewed this saved version and confirm sending it to{" "}
                  {notice.applicantEmail || "the applicant"}.
                </label>
                <button
                  className="admin-primary"
                  disabled={
                    busy ||
                    dirty ||
                    !confirmed ||
                    errors.length > 0 ||
                    !!current?.status
                  }
                  onClick={() =>
                    perform(async () => {
                      await api("notices/send", "POST", {
                        versionId: current!.id,
                        confirmed: true,
                      });
                      const rows = await refresh();
                      setCurrent(
                        rows.find((v) => v.id === current!.id) || current,
                      );
                      setConfirmed(false);
                      setMessage(
                        "Accepted by Resend. This confirms acceptance for sending, not inbox delivery.",
                      );
                    }).finally(() => {
                      refresh()
                        .then((rows) => {
                          if (current)
                            setCurrent(
                              rows.find((v) => v.id === current.id) || current,
                            );
                        })
                        .catch(() => {});
                    })
                  }
                >
                  Send notice
                </button>
              </>
            )}
            <p className="small-note">
              Save, preview, then confirm the recipient to send. Sent content
              stays attached to its version. Resend acceptance does not confirm
              inbox delivery.
            </p>
            <p className="small-note">
              For an application received before criteria were provided, this
              notice does not establish earlier disclosure or resolve any
              application-fee refund obligations.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
