// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { agencyPresets } from "@/lib/adverse/agencies";
import {
  blankNotice,
  type Notice,
  noticeSchema,
  type RichNode,
  renderNotice,
  sendErrors,
} from "@/lib/adverse/notice";
import { requireValue } from "@/lib/required";
import { RemoveButton } from "./management/remove-button";
import { SectionCard } from "./management/section-card";
import { NoticeTemplatePicker } from "./notice-template-picker";

interface Version {
  createdAt: string;
  documentId: string;
  html?: string;
  id: string;
  notice: Notice;
  resendId?: string | null;
  status?: string | null;
  version: number;
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/admin/${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The request failed.");
  }
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
    content: value,
    editorProps: {
      attributes: {
        "aria-label": "Reasons for the decision",
        "aria-multiline": "true",
        class: "reasons-content",
        role: "textbox",
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: editorLocal }) =>
      onChange(editorLocal.getJSON() as RichNode),
  });

  return (
    <div className="reasons-editor">
      <div
        aria-label="Reason formatting"
        className="editor-tools"
        role="toolbar"
      >
        <Button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          type="button"
        >
          Bold
        </Button>
        <Button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          type="button"
        >
          Italic
        </Button>
        <Button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          type="button"
        >
          Bullets
        </Button>
        <Button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          type="button"
        >
          Numbered list
        </Button>
        <Button
          onClick={() => editor?.chain().focus().undo().run()}
          type="button"
        >
          Undo
        </Button>
        <Button
          onClick={() => editor?.chain().focus().redo().run()}
          type="button"
        >
          Redo
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export default function AdverseEditor({
  signedIn,
  loginError,
  documentId,
}: {
  signedIn: boolean;
  documentId?: string;
  loginError?: string;
}) {
  const removedNotice = useRef(false);
  const authenticated = signedIn;
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
  async function refresh(selectedDocumentId?: string) {
    const id = selectedDocumentId ?? current?.documentId;
    if (!id) {
      setVersions([]);
      setHasMore(false);
      return [] as Version[];
    }
    const data = await api(`notices?documentId=${id}`);
    setVersions(data.versions);
    setHasMore(data.versions.length === 200);
    return data.versions as Version[];
  }
  const applyVersion = useCallback((v: Version | null) => {
    window.history.replaceState(
      null,
      "",
      `/admin/adverse-actions/${v?.documentId ?? "new"}`
    );
    setCurrent(v);
    if (!v) {
      setVersions([]);
      setHasMore(false);
    }
    setNotice(v ? v.notice : blankNotice());
    setEditorKey((k) => k + 1);
    setPreview(false);
    setConfirmed(false);
    setError("");
    setMessage("");
  }, []);
  useEffect(() => {
    let active = true;
    if (authenticated && documentId) {
      api(`notices?documentId=${documentId}`)
        .then((data) => {
          if (!active || removedNotice.current) {
            return;
          }
          const rows = data.versions as Version[];
          setVersions(rows);
          setHasMore(rows.length === 200);
          if (rows[0]) {
            applyVersion(rows[0]);
          } else {
            setError("This notice was not found.");
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [authenticated, documentId, applyVersion]);

  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (
        /* biome-ignore lint/suspicious/noUnnecessaryConditions: The removal callback mutates this ref between renders; unloading must reread it. */
        !removedNotice.current &&
        dirty &&
        (notice.applicantName || notice.applicantEmail)
      ) {
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
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Discard your unsaved edits?"
        )
      )
    ) {
      return;
    }
    applyVersion(v);
  }

  const field = (key: keyof Notice, label: string, type = "text") => (
    <label className="field">
      {label}
      <input
        maxLength={key === "senderContact" ? 1000 : 300}
        onChange={(e) => change(key, e.target.value as never)}
        type={type}
        value={String(notice[key])}
      />
    </label>
  );
  const status = (s?: string | null) => {
    const resolveResult1 = () => {
      if (s === "accepted") {
        return "Accepted by Resend";
      }
      if (s === "sending") {
        return "Sending / check Resend";
      }
      if (s === "unknown") {
        return "Uncertain / check Resend";
      }
      if (s === "rejected") {
        return "Rejected by Resend";
      }
      return "Draft";
    };
    return resolveResult1();
  };
  useEffect(() => {
    const beforeSignOut = (event: Event) => {
      if (
        dirty &&
        (notice.applicantName || notice.applicantEmail) &&
        !(
          /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ confirm(
            "Discard unsaved edits and sign out?"
          )
        )
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("owner-sign-out", beforeSignOut);
    return () => window.removeEventListener("owner-sign-out", beforeSignOut);
  }, [dirty, notice.applicantName, notice.applicantEmail]);
  if (!authenticated) {
    return (
      <div className="admin-shell admin-login">
        <a href="/">Back Acres Rental</a>
        <p className="eyebrow">Private workspace</p>
        <p>Sign in to prepare, save, and send applicant notices.</p>
        <p className="small-note">
          Use an approved Google account. Access is limited to the property’s
          administrators.
        </p>
        <Button
          className="admin-primary"
          disabled={busy}
          onClick={() =>
            perform(async () => {
              await signIn("google", { callbackUrl: "/admin/adverse-actions" });
            })
          }
          type="button"
        >
          {busy ? "Connecting to Google…" : "Continue with Google"}
        </Button>
        {!!(error || loginError) && (
          <p className="form-error" role="alert">
            {error ||
              (loginError === "AccessDenied"
                ? "This Google account is not approved for access. Choose an approved account or contact the property administrator."
                : "Google sign-in could not be completed. Try again or contact the property administrator.")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <nav aria-label="Notice navigation" className="notice-return">
        <a href="/admin/adverse-actions">← All adverse-action notices</a>
        {!!versions[0] && (
          <RemoveButton
            disabled={busy}
            id={versions[0].documentId}
            kind="notice"
            name={versions[0].notice.applicantName || "Untitled notice"}
            onRemoved={() => {
              removedNotice.current = true;
              window.location.href = "/admin/adverse-actions";
            }}
          />
        )}
      </nav>
      <div className="admin-workspace">
        <SectionCard
          className="notice-history"
          labelledBy="notice-history-heading"
        >
          <h2 id="notice-history-heading">Version history</h2>
          <div className="admin-actions notice-history-actions">
            <Button disabled={busy} onClick={() => load(null)} type="button">
              New notice
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await refresh();
                })
              }
              type="button"
            >
              Refresh
            </Button>
          </div>
          <p className="small-note">
            Versions of this notice only. Every save preserves a separate
            revision.
          </p>
          {!!(versions.length === 0) && <p>No saved notices yet.</p>}
          {versions.map((v) => (
            <Button
              aria-current={current?.id === v.id ? "true" : undefined}
              aria-label={`${v.notice.applicantName || "Untitled notice"} · Version ${v.version} · ${status(v.status)}`}
              className="version-item"
              disabled={busy}
              key={v.id}
              onClick={() => load(v)}
              type="button"
            >
              <strong>Version {v.version}</strong>
              <span>{status(v.status)}</span>
              <span>{new Date(v.createdAt).toLocaleString()}</span>
            </Button>
          ))}
          {!!hasMore && (
            <Button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  const data = await api(
                    `notices?documentId=${current?.documentId ?? documentId}&offset=${versions.length}`
                  );
                  setVersions((v) => [...v, ...data.versions]);
                  setHasMore(data.versions.length === 200);
                })
              }
              type="button"
            >
              Load earlier versions
            </Button>
          )}
        </SectionCard>
        <div className="notice-main">
          <div className="admin-actions notice-toolbar">
            <p className="eyebrow">
              {current ? `Version ${current.version}` : "New notice"}
              {dirty ? " · Unsaved edits" : " · Saved"}
            </p>
            <div className="notice-toolbar-actions">
              <Button
                className="admin-primary"
                disabled={busy || !dirty}
                onClick={() =>
                  perform(async () => {
                    const result = await api("notices", "POST", {
                      notice,
                      parentId: current?.id || null,
                      requestId: crypto.randomUUID(),
                    });
                    window.history.replaceState(
                      null,
                      "",
                      `/admin/adverse-actions/${result.version.documentId}`
                    );
                    setCurrent(result.version);
                    await refresh(result.version.documentId);
                    setConfirmed(false);
                    setMessage(`Version ${result.version.version} saved.`);
                  })
                }
                type="button"
              >
                {busy ? "Working…" : "Save new version"}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setPreview(!preview);
                  setConfirmed(false);
                }}
                type="button"
              >
                {preview ? "Edit notice" : "Preview notice"}
              </Button>
            </div>
          </div>
          {!!error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!!message && (
            <p className="admin-message" role="status">
              {message}
            </p>
          )}
          {!preview && (
            <NoticeTemplatePicker
              disabled={busy}
              key={current?.id ?? "new"}
              notice={notice}
              onApply={(next) => {
                setNotice(next);
                setEditorKey((k) => k + 1);
                setConfirmed(false);
                setMessage(
                  "Template applied. Review the wording and complete the applicant and report details before sending."
                );
              }}
            />
          )}
          {preview ? (
            <article
              aria-label="Notice preview"
              className="notice-preview"
              /* biome-ignore lint/security/noDangerouslySetInnerHtml: renderNotice escapes every applicant field and allowlists rich text before preview or persistence. */
              dangerouslySetInnerHTML={{
                __html: !dirty && current?.html ? current.html : rendered.html,
              }}
            />
          ) : (
            <fieldset className="notice-fields" disabled={busy}>
              <SectionCard labelledBy="notice-applicant-heading">
                <h2 id="notice-applicant-heading">
                  01 · Applicant and decision
                </h2>
                <div className="fields">
                  {field("applicantName", "Applicant full name")}
                  {field("applicantEmail", "Applicant email", "email")}
                  {field("noticeDate", "Notice date", "date")}
                  {field("property", "Property address")}
                  {field("senderName", "Sender name")}
                  {field("senderContact", "Sender contact information")}
                  <AppSelect
                    label={<>Action taken</>}
                    onValueChange={(value) =>
                      change("action", value as Notice["action"])
                    }
                    value={notice.action}
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
                  </AppSelect>
                </div>
                <label className="field">
                  Decision details or required terms
                  <textarea
                    maxLength={2000}
                    onChange={(e) => change("actionDetails", e.target.value)}
                    value={notice.actionDetails}
                  />
                </label>
              </SectionCard>
              <SectionCard labelledBy="notice-reasons-heading">
                <h2 id="notice-reasons-heading">
                  02 · Reasons for the decision
                </h2>
                <p className="section-intro">
                  Describe the actual reasons for this applicant. Avoid
                  including Social Security numbers or full account numbers.
                </p>
                <Reasons
                  key={editorKey}
                  onChange={(value) => change("reasons", value)}
                  value={notice.reasons}
                />
              </SectionCard>
              <SectionCard labelledBy="notice-disclosures-heading">
                <h2 id="notice-disclosures-heading">
                  03 · Consumer report disclosures
                </h2>
                <label className="check-row">
                  <input
                    checked={notice.reportUsed}
                    onChange={(e) => {
                      change("reportUsed", e.target.checked);
                      if (!e.target.checked) {
                        change("scoreUsed", false);
                      }
                    }}
                    type="checkbox"
                  />
                  A consumer report influenced this decision, in whole or in
                  part.
                </label>
                {!!notice.reportUsed && (
                  <>
                    <p className="section-intro">
                      Select each agency whose report influenced the decision.
                      Its name, mailing address, and toll-free number fill in
                      automatically. You can edit the details if your report
                      lists a different contact.
                    </p>
                    {notice.agencies.map((a, i) => (
                      /* biome-ignore lint/suspicious/noArrayIndexKey: These controlled agency inputs represent ordered schema slots, with no independent row state. */
                      <div className="agency-fields" key={i}>
                        <h3>Reporting agency {i + 1}</h3>
                        <AppSelect
                          aria-label={`Choose reporting agency ${i + 1}`}
                          label={<>Choose reporting agency {i + 1}</>}
                          onValueChange={(value) => {
                            const preset = agencyPresets.find(
                              (item) => item.id === value
                            );
                            if (!preset) {
                              return;
                            }
                            const { name, address, phone } = preset;
                            change(
                              "agencies",
                              notice.agencies.map((row, index) =>
                                index === i ? { address, name, phone } : row
                              )
                            );
                          }}
                          value={
                            agencyPresets.find(
                              (preset) =>
                                preset.name === a.name &&
                                preset.address === a.address &&
                                preset.phone === a.phone
                            )?.id ?? ""
                          }
                        >
                          <option value="">
                            Choose an agency or enter custom details
                          </option>
                          {agencyPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </AppSelect>
                        <div className="fields">
                          {(["name", "address", "phone"] as const).map((k) => {
                            const resolveResult2 = () => {
                              if (k === "name") {
                                return "Agency name";
                              }
                              if (k === "address") {
                                return "Mailing address";
                              }
                              return "Phone / toll-free number";
                            };
                            return (
                              <label className="field" key={k}>
                                {resolveResult2()}
                                <input
                                  maxLength={k === "address" ? 1000 : 300}
                                  onChange={(e) =>
                                    change(
                                      "agencies",
                                      notice.agencies.map((row, index) =>
                                        index === i
                                          ? { ...row, [k]: e.target.value }
                                          : row
                                      )
                                    )
                                  }
                                  value={a[k]}
                                />
                              </label>
                            );
                          })}
                        </div>
                        {!!(notice.agencies.length > 1) && (
                          <Button
                            onClick={() =>
                              change(
                                "agencies",
                                notice.agencies.filter(
                                  (_, index) => index !== i
                                )
                              )
                            }
                            type="button"
                          >
                            Remove agency {i + 1}
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      disabled={notice.agencies.length >= 10}
                      onClick={() =>
                        change("agencies", [
                          ...notice.agencies,
                          { address: "", name: "", phone: "" },
                        ])
                      }
                      type="button"
                    >
                      Add reporting agency
                    </Button>
                    <p className="small-note">
                      The notice automatically includes the agency’s
                      non-involvement in the decision, the right to dispute, and
                      the right to request a free report within 60 days.
                    </p>
                    <label className="check-row">
                      <input
                        checked={notice.scoreUsed}
                        onChange={(e) => change("scoreUsed", e.target.checked)}
                        type="checkbox"
                      />
                      A numerical credit score was used in this decision.
                    </label>
                    {!!notice.scoreUsed && (
                      <div className="score-fields">
                        <div className="fields">
                          {field("score", "Credit score", "number")}
                          {field("scoreMin", "Lowest possible score", "number")}
                          {field(
                            "scoreMax",
                            "Highest possible score",
                            "number"
                          )}
                          {field("scoreDate", "Date score was created", "date")}
                          {field("scoreSource", "Score source")}
                        </div>
                        <label className="field">
                          Key factors affecting the score, in order of
                          importance
                          <textarea
                            maxLength={3000}
                            onChange={(e) =>
                              change("scoreFactors", e.target.value)
                            }
                            value={notice.scoreFactors}
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
            </fieldset>
          )}
          <SectionCard className="notice-send" label="Send notice">
            <div className="admin-actions">
              {!!preview && (
                <Button onClick={() => window.print()} type="button">
                  Print notice
                </Button>
              )}
            </div>
            {!!(errors.length > 0) && (
              <details>
                <summary>
                  {errors.length} item{errors.length === 1 ? "" : "s"} to
                  complete before sending
                </summary>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            {!!current?.status && (
              <p>
                {status(current.status)}
                {current.resendId ? ` · Email ID: ${current.resendId}` : ""}
              </p>
            )}
            {!!preview && (
              <>
                <label className="check-row">
                  <input
                    checked={confirmed}
                    disabled={
                      dirty || errors.length > 0 || !!current?.status || busy
                    }
                    onChange={(e) => setConfirmed(e.target.checked)}
                    type="checkbox"
                  />
                  I reviewed this saved version and confirm sending it to{" "}
                  {notice.applicantEmail || "the applicant"}.
                </label>
                <Button
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
                        confirmed: true,
                        versionId: requireValue(current, "Expected current").id,
                      });
                      const rows = await refresh();
                      setCurrent(
                        rows.find(
                          (v) =>
                            v.id ===
                            requireValue(current, "Expected current").id
                        ) || current
                      );
                      setConfirmed(false);
                      setMessage(
                        "Accepted by Resend. This confirms acceptance for sending, not inbox delivery."
                      );
                    }).finally(() => {
                      refresh()
                        .then((rows) => {
                          if (current) {
                            setCurrent(
                              rows.find((v) => v.id === current.id) || current
                            );
                          }
                        })
                        .catch(() => {
                          /* Best-effort fallback: retain the original result when this optional operation fails. */
                        });
                    })
                  }
                  type="button"
                >
                  Send notice
                </Button>
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
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
