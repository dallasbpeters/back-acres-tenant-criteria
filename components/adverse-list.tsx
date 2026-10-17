"use client";
import { AppSelect } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
type NoticeRow = {
  id: string;
  documentId: string;
  version: number;
  applicantName: string;
  applicantEmail: string;
  property: string;
  action: string;
  createdAt: string;
  status: string | null;
  lastAcceptedVersion: number | null;
};
const statuses = [
  ["all", "All statuses"],
  ["draft", "Draft"],
  ["accepted", "Accepted by Resend"],
  ["sending", "Sending — check Resend"],
  ["unknown", "Uncertain — check Resend"],
  ["rejected", "Rejected by Resend"],
];
const label = (status: string | null) =>
  statuses.find((s) => s[0] === (status ?? "draft"))?.[1] ?? "Draft";
export function AdverseList({
  initialQuery = "",
  initialStatus = "all",
}: {
  initialQuery?: string;
  initialStatus?: string;
}) {
  const [query, setQuery] = useState(initialQuery),
    [applied, setApplied] = useState(initialQuery),
    [filter, setFilter] = useState(
      statuses.some((s) => s[0] === initialStatus) ? initialStatus : "all",
    ),
    [rows, setRows] = useState<NoticeRow[]>([]),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  async function fetchRows(offset: number) {
    const params = new URLSearchParams({
      view: "list",
      q: applied,
      status: filter,
      offset: String(offset),
    });
    const response = await fetch(`/api/admin/notices?${params}`, {
        cache: "no-store",
      }),
      data = await response.json();
    if (!response.ok) throw Error(data.error || "Could not load notices.");
    return data as {
      documents: NoticeRow[];
      hasMore: boolean;
      nextOffset: number;
    };
  }
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setRows([]);
    fetchRows(0)
      .then((data) => {
        if (request !== generation.current) return;
        setRows(data.documents);
        setMore(data.hasMore);
        setOffset(data.nextOffset);
      })
      .catch((e) => {
        if (request === generation.current) setError(e.message);
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [applied, filter, refresh]);
  return (
    <section aria-label="Adverse-action notice list">
      <div className="section-heading-row">
        <div>
          <h2>All notices</h2>
          <p className="small-note">
            One row per notice. Open a notice to edit it or review its versions.
          </p>
        </div>
        <a href="/admin/adverse-actions/new" className="submit-button">
          New notice
        </a>
      </div>
      <form
        className="notice-list-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(query.trim());
          const params = new URLSearchParams();
          if (query.trim()) params.set("q", query.trim());
          if (filter !== "all") params.set("status", filter);
          window.history.replaceState(
            null,
            "",
            `/admin/adverse-actions${params.size ? "?" + params : ""}`,
          );
          setRefresh((n) => n + 1);
        }}
      >
        <label className="field">
          Search notices
          <input
            type="search"
            value={query}
            maxLength={200}
            placeholder="Applicant, email, or property"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <AppSelect
          label={<>Latest version status</>}
          aria-label="Latest version status"
          value={filter}
          onValueChange={(value) => setFilter(value)}
        >
          {statuses.map(([value, text]) => (
            <option value={value} key={value}>
              {text}
            </option>
          ))}
        </AppSelect>
        <button type="submit">Search</button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading && !rows.length ? (
        <p role="status">Loading notices…</p>
      ) : !rows.length && !error ? (
        <p className="management-empty">
          {applied || filter !== "all"
            ? "No notices match these filters."
            : "No adverse-action notices yet. Create your first notice to get started."}
        </p>
      ) : (
        <div className="notice-table-scroll">
          <table className="notice-table" aria-label="Adverse-action notices">
            <thead>
              <tr>
                <th scope="col">Applicant</th>
                <th scope="col">Property / decision</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.documentId}>
                  <td>
                    <strong>{row.applicantName || "Untitled notice"}</strong>
                    <span>{row.applicantEmail || "No email entered"}</span>
                  </td>
                  <td>
                    {row.property || "No property entered"}
                    <span>
                      {row.action} · Version {row.version}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`notice-status notice-status-${row.status ?? "draft"}`}
                    >
                      {label(row.status)}
                    </span>
                    {row.lastAcceptedVersion !== null &&
                      row.lastAcceptedVersion < row.version && (
                        <small>
                          Version {row.lastAcceptedVersion} previously accepted
                          by Resend
                        </small>
                      )}
                  </td>
                  <td>
                    <time dateTime={row.createdAt}>
                      {new Date(row.createdAt).toLocaleDateString()}
                    </time>
                  </td>
                  <td>
                    <a
                      href={`/admin/adverse-actions/${row.documentId}`}
                      aria-label={`Open notice for ${row.applicantName || "untitled applicant"} at ${row.property || "unspecified property"}`}
                    >
                      Open notice →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className="management-actions notice-list-footer">
          <p className="small-note">
            {rows.length} notice{rows.length === 1 ? "" : "s"} shown. Email
            acceptance does not confirm inbox delivery.
          </p>
          {more && (
            <button
              disabled={loading}
              onClick={async () => {
                const request = generation.current;
                setLoading(true);
                setError("");
                try {
                  const data = await fetchRows(offset);
                  if (request === generation.current) {
                    setRows((previous) => [
                      ...previous,
                      ...data.documents.filter(
                        (row) =>
                          !previous.some(
                            (old) => old.documentId === row.documentId,
                          ),
                      ),
                    ]);
                    setMore(data.hasMore);
                    setOffset(data.nextOffset);
                  }
                } catch (e) {
                  if (request === generation.current)
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not load more notices.",
                    );
                } finally {
                  if (request === generation.current) setLoading(false);
                }
              }}
            >
              {loading ? "Loading…" : "Load more notices"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
