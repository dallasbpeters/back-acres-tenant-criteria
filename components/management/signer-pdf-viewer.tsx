// biome-ignore-all lint/performance/noJsxPropsBind: react-pdf callbacks capture the current load state; these are not memoized children.
"use client";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
const options = {
  standardFontDataUrl: "/pdf-assets/standard_fonts/",
  wasmUrl: "/pdf-assets/wasm/",
};

/**
 * Shows the exact frozen lease PDF a signer is signing, every page stacked
 * for reading. Fetching it records that the signer viewed the PDF (the same
 * server check a download satisfies), so `onViewed` unlocks signing.
 */
export function SignerPdfViewer({
  authorization,
  endpoint,
  onViewed,
}: {
  authorization: string;
  endpoint: string;
  onViewed: () => void;
}) {
  const [file, setFile] = useState<{ data: Uint8Array } | null>(null),
    [error, setError] = useState(""),
    [count, setCount] = useState(0),
    [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const pageNumbers = Array.from({ length: count }, (_, i) => i + 1);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`${endpoint}?format=pdf`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${authorization}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => ({}))).error ??
              "Could not load the lease PDF."
          );
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (!controller.signal.aborted) {
          setFile({ data });
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
        }
      }
    })();
    return () => controller.abort();
  }, [authorization, endpoint]);
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
  return (
    <section aria-label="Lease to sign" className="signer-pdf">
      <div className="signer-pdf-pages" ref={container}>
        {!(file || error) && <p role="status">Loading the lease PDF…</p>}
        {!!error && (
          <p role="alert">
            {error} Use “Download lease PDF” above to review it instead.
          </p>
        )}
        {!!(file && width > 0) && (
          <Document
            file={file}
            loading={<p role="status">Opening the lease PDF…</p>}
            onLoadError={() =>
              setError("The lease PDF could not be shown here.")
            }
            onLoadSuccess={({ numPages }) => {
              setCount(numPages);
              onViewed();
            }}
            options={options}
            suspense={false}
          >
            {pageNumbers.map((pageNumber) => (
              <Page
                className="signer-pdf-page"
                devicePixelRatio={Math.min(window.devicePixelRatio, 2)}
                key={pageNumber}
                loading={<p role="status">Rendering page {pageNumber}…</p>}
                pageNumber={pageNumber}
                renderAnnotationLayer={false}
                suspense={false}
                width={Math.min(width, 816)}
              />
            ))}
          </Document>
        )}
      </div>
      {count > 0 && (
        <p className="small-note">
          {count} {count === 1 ? "page" : "pages"}. Sign below the last page.
        </p>
      )}
    </section>
  );
}
