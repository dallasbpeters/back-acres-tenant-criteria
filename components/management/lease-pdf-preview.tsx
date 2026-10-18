"use client";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
const options = {
  standardFontDataUrl: "/pdf-assets/standard_fonts/",
  wasmUrl: "/pdf-assets/wasm/",
};
export function LeasePdfPreview({
  draftId,
  revision,
  onClose,
}: {
  draftId: string;
  revision: number;
  onClose: () => void;
}) {
  const [file, setFile] = useState<{ data: Uint8Array } | null>(null),
    [error, setError] = useState(""),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [signaturePage, setSignaturePage] = useState(0),
    [width, setWidth] = useState(0),
    [refresh, setRefresh] = useState(0),
    [zoom, setZoom] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const url = `/api/admin/leases/${draftId}/pdf?preview=1`;
  useEffect(() => {
    const controller = new AbortController();
    setFile(null);
    setError("");
    setCount(0);
    setSignaturePage(0);
    setPage(1);
    void (async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw Error(
            (await response.json()).error ?? "Could not load this lease PDF.",
          );
        const data = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        setSignaturePage(
          Number(response.headers.get("X-Lease-Signature-Page")) || 0,
        );
        setFile({ data });
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => controller.abort();
  }, [url, revision, refresh]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (container.current) container.current.scrollTop = 0;
  }, [page]);
  return (
    <section className="lease-pdf-preview" aria-label="Lease PDF preview">
      <div className="lease-pdf-heading">
        <div>
          <h4>Lease PDF preview</h4>
          <p>The actual lease PDF, with signatures recorded so far.</p>
        </div>
        <Button type="button" onClick={onClose}>
          Close preview
        </Button>
      </div>
      <div className="lease-pdf-toolbar" aria-label="PDF controls">
        <div className="lease-pdf-pagination">
          <Button
            type="button"
            disabled={page <= 1 || !count}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous page
          </Button>
          <span aria-live="polite">
            Page {count ? page : "–"} of {count || "–"}
          </span>
          <Button
            type="button"
            disabled={!count || page >= count}
            onClick={() => setPage((p) => p + 1)}
          >
            Next page
          </Button>
        </div>
        <div className="lease-pdf-zoom" aria-label="PDF zoom">
          <Button
            type="button"
            aria-label="Zoom out PDF"
            disabled={zoom <= 1}
            onClick={() => setZoom((v) => Math.max(1, v - 0.25))}
          >
            −
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            aria-label="Zoom in PDF"
            disabled={zoom >= 2.5}
            onClick={() => setZoom((v) => Math.min(2.5, v + 0.25))}
          >
            +
          </Button>
          <Button
            type="button"
            disabled={zoom === 1}
            onClick={() => {
              setZoom(1);
              if (container.current) container.current.scrollLeft = 0;
            }}
          >
            Fit width
          </Button>
        </div>
        <div className="management-actions">
          {signaturePage > 0 && (
            <Button
              type="button"
              disabled={!count}
              onClick={() => setPage(signaturePage)}
            >
              View signatures
            </Button>
          )}
          <Button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Refresh PDF
          </Button>
          <a href={url}>Download this PDF</a>
        </div>
      </div>
      {error && (
        <p role="alert">{error} You can also try downloading the PDF.</p>
      )}
      <div className="lease-pdf-canvas" ref={container}>
        {!file && !error && <p role="status">Preparing PDF preview…</p>}
        {file && width > 0 && (
          <Document
            suspense={false}
            file={file}
            options={options}
            onLoadSuccess={({ numPages }) => setCount(numPages)}
            onLoadError={() => setError("The PDF preview could not be opened.")}
            loading={<p role="status">Opening PDF…</p>}
          >
            <Page
              suspense={false}
              pageNumber={page}
              width={Math.min(width, 816) * zoom}
              devicePixelRatio={Math.min(window.devicePixelRatio, 2)}
              renderAnnotationLayer={false}
              loading={<p role="status">Rendering page…</p>}
            />
          </Document>
        )}
      </div>
    </section>
  );
}
