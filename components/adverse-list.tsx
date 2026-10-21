// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { RemoveButton } from "./management/remove-button";
import { SectionCard } from "./management/section-card";

interface NoticeRow {
  action: string;
  applicantEmail: string;
  applicantName: string;
  createdAt: string;
  documentId: string;
  id: string;
  lastAcceptedVersion: number | null;
  property: string;
  status: string | null;
  version: number;
}
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
      statuses.some((s) => s[0] === initialStatus) ? initialStatus : "all"
    ),
    [rows, setRows] = useState<NoticeRow[]>([]),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const fetchRows = useCallback(
    async (offsetLocal: number) => {
      const params = new URLSearchParams({
        offset: String(offsetLocal),
        q: applied,
        revision: String(refresh),
        status: filter,
        view: "list",
      });
      const response = await fetch(`/api/admin/notices?${params}`, {
          cache: "no-store",
        }),
        data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load notices.");
      }
      return data as {
        documents: NoticeRow[];
        hasMore: boolean;
        nextOffset: number;
      };
    },
    [applied, filter, refresh]
  );

  useEffect(() => {
    generation.current += 1;
    const request = generation.current;
    setLoading(true);
    setError("");
    setRows([]);
    fetchRows(0)
      .then((data) => {
        if (request !== generation.current) {
          return;
        }
        setRows(data.documents);
        setMore(data.hasMore);
        setOffset(data.nextOffset);
      })
      .catch((e) => {
        if (request === generation.current) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (request === generation.current) {
          setLoading(false);
        }
      });
    return () => {
      generation.current += 1;
    };
  }, [fetchRows]);

  const resolveResult1 = () => {
    if (loading && !rows.length) {
      return <p role="status">Loading notices…</p>;
    }
    if (rows.length || error) {
      return (
        <div className="notice-table-scroll">
          <table aria-label="Adverse-action notices" className="notice-table">
            <thead>
              <tr>
                <th scope="col">Applicant</th>
                <th scope="col">Property / decision</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th aria-label="View" scope="col">
                  View
                </th>
                <th aria-label="Actions" scope="col">
                  Actions
                </th>
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
                    {!!(
                      row.lastAcceptedVersion !== null &&
                      row.lastAcceptedVersion < row.version
                    ) && (
                      <small>
                        Version {row.lastAcceptedVersion} previously accepted by
                        Resend
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
                      aria-label={`Open notice for ${row.applicantName || "untitled applicant"} at ${row.property || "unspecified property"}`}
                      href={`/admin/adverse-actions/${row.documentId}`}
                    >
                      Open notice →
                    </a>
                  </td>
                  <td>
                    <RemoveButton
                      disabled={loading}
                      id={row.documentId}
                      kind="notice"
                      name={row.applicantName || "Untitled notice"}
                      onRemoved={() => setRefresh((n) => n + 1)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p className="management-empty">
        {applied || filter !== "all"
          ? "No notices match these filters."
          : "No adverse-action notices yet. Create your first notice to get started."}
      </p>
    );
  };
  return (
    <SectionCard labelledBy="notices-heading">
      <div className="section-heading-row">
        <div>
          <h2 id="notices-heading">All notices</h2>
          <p className="small-note">
            One row per notice. Open a notice to edit it or review its versions.
          </p>
        </div>
        <a className="submit-button" href="/admin/adverse-actions/new">
          New notice
        </a>
      </div>
      <form
        className="notice-list-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(query.trim());
          const params = new URLSearchParams();
          if (query.trim()) {
            params.set("q", query.trim());
          }
          if (filter !== "all") {
            params.set("status", filter);
          }
          window.history.replaceState(
            null,
            "",
            `/admin/adverse-actions${params.size ? `?${params}` : ""}`
          );
          setRefresh((n) => n + 1);
        }}
      >
        <label className="field">
          Search notices
          <input
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Applicant, email, or property"
            type="search"
            value={query}
          />
        </label>
        <AppSelect
          aria-label="Latest version status"
          label={<>Latest version status</>}
          onValueChange={(value) => setFilter(value)}
          value={filter}
        >
          {statuses.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </AppSelect>
        <Button type="submit">Search</Button>
        <Button
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
          type="button"
        >
          Refresh
        </Button>
      </form>
      {!!error && <p role="alert">{error}</p>}
      {resolveResult1()}
      {!!(rows.length > 0) && (
        <div className="management-actions notice-list-footer">
          <p className="small-note">
            {rows.length} notice{rows.length === 1 ? "" : "s"} shown. Email
            acceptance does not confirm inbox delivery.
          </p>
          {!!more && (
            <Button
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
                            (old) => old.documentId === row.documentId
                          )
                      ),
                    ]);
                    setMore(data.hasMore);
                    setOffset(data.nextOffset);
                  }
                } catch (e) {
                  if (request === generation.current) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not load more notices."
                    );
                  }
                } finally {
                  if (request === generation.current) {
                    setLoading(false);
                  }
                }
              }}
              type="submit"
            >
              {loading ? "Loading…" : "Load more notices"}
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
