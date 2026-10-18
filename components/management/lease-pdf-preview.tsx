// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Icon } from "@/components/ui/icon";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
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
  const [file, setFile] = useState<{
      data: Uint8Array;
    } | null>(null),
    [error, setError] = useState(""),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [signaturePage, setSignaturePage] = useState(0),
    [width, setWidth] = useState(0),
    [refresh, setRefresh] = useState(0),
    [zoom, setZoom] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const url = `/api/admin/leases/${draftId}/pdf?preview=1&revision=${encodeURIComponent(String(revision))}&refresh=${refresh}`;
  useEffect(() => {
    const controller = new AbortController();
    setFile(null);
    setError("");
    setCount(0);
    setSignaturePage(0);
    setPage(1);
    (async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            (await response.json()).error ?? "Could not load this lease PDF."
          );
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) {
          return;
        }
        setSignaturePage(
          Number(response.headers.get("X-Lease-Signature-Page")) || 0
        );
        setFile({ data });
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
        }
      }
    })();
    return () => controller.abort();
  }, [url]);
  useEffect(() => {
    if (!container.current) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width))
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing the displayed page must reset scroll, even though the reset itself does not read its number.
  useEffect(() => {
    if (container.current) {
      container.current.scrollTop = 0;
    }
  }, [page]);

  return (
    <section aria-label="Lease PDF preview" className="lease-pdf-preview">
      <div className="lease-pdf-heading">
        <div>
          <h4>Lease PDF preview</h4>
          <p>The actual lease PDF, with signatures recorded so far.</p>
        </div>
        <Button
          aria-label="Close preview"
          className="icon-button"
          onClick={onClose}
          title="Close preview"
          type="button"
        >
          <Icon name="close" size={24} />
        </Button>
      </div>
      <section aria-label="PDF controls" className="lease-pdf-toolbar">
        <div className="lease-pdf-pagination">
          <Button
            disabled={page <= 1 || !count}
            onClick={() => setPage((p) => p - 1)}
            type="button"
          >
            Previous page
          </Button>
          <span aria-live="polite">
            Page {count ? page : "–"} of {count || "–"}
          </span>
          <Button
            disabled={!count || page >= count}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Next page
          </Button>
        </div>
        <section aria-label="PDF zoom" className="lease-pdf-zoom">
          <Button
            aria-label="Zoom out PDF"
            disabled={zoom <= 1}
            onClick={() => setZoom((v) => Math.max(1, v - 0.25))}
            type="button"
          >
            −
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            aria-label="Zoom in PDF"
            disabled={zoom >= 2.5}
            onClick={() => setZoom((v) => Math.min(2.5, v + 0.25))}
            type="button"
          >
            +
          </Button>
          <Button
            disabled={zoom === 1}
            onClick={() => {
              setZoom(1);
              if (container.current) {
                container.current.scrollLeft = 0;
              }
            }}
            type="button"
          >
            Fit width
          </Button>
        </section>
        <div className="management-actions">
          {!!(signaturePage > 0) && (
            <Button
              disabled={!count}
              onClick={() => setPage(signaturePage)}
              type="button"
            >
              View signatures
            </Button>
          )}
          <Button onClick={() => setRefresh((v) => v + 1)} type="button">
            Refresh PDF
          </Button>
          <a href={url}>Download this PDF</a>
        </div>
      </section>
      {!!error && (
        <p role="alert">{error} You can also try downloading the PDF.</p>
      )}
      <div className="lease-pdf-canvas" ref={container}>
        {!(file || error) && <p role="status">Preparing PDF preview…</p>}
        {!!(file && width > 0) && (
          <Document
            file={file}
            loading={<p role="status">Opening PDF…</p>}
            onLoadError={() => setError("The PDF preview could not be opened.")}
            onLoadSuccess={({ numPages }) => setCount(numPages)}
            options={options}
            suspense={false}
          >
            <Page
              devicePixelRatio={Math.min(window.devicePixelRatio, 2)}
              loading={<p role="status">Rendering page…</p>}
              pageNumber={page}
              renderAnnotationLayer={false}
              suspense={false}
              width={Math.min(width, 816) * zoom}
            />
          </Document>
        )}
      </div>
    </section>
  );
}
