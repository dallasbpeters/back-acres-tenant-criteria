"use client";
import { Button } from "@/components/ui/button";

import { AppSelect } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { listingProviders, listingText } from "@/lib/management/listings";
import type { PropertyRecord } from "./dashboard";
import { PhotoManager, type PhotoRecord } from "./photos";
export type PublicationRecord = {
  propertyId: string;
  provider: string;
  status: string;
  contentDigest: string;
  updatedAt: string;
};
export function PublishingWorkspace({
  properties,
  photos,
  publications,
  onSaved,
}: {
  properties: PropertyRecord[];
  photos: PhotoRecord[];
  publications: PublicationRecord[];
  onSaved: () => Promise<void>;
}) {
  useEffect(() => {
    setChosen(
      new URLSearchParams(window.location.search).get("property") ?? "",
    );
  }, []);
  const [chosen, setChosen] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const property = properties.find((p) => p.id === chosen) ?? properties[0];
  async function status(provider: string, value: string) {
    if (!property) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/listings/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: property.id,
            provider,
            status: value,
          }),
        }),
        result = await r.json();
      if (!r.ok) throw Error(result.error);
      await onSaved();
      setMessage("Publishing status saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save status.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-heading-row">
        <div>
          <h2>Photos & publishing</h2>
          <p>Prepare once, then publish through your listing accounts.</p>
        </div>
      </div>
      {!property ? (
        <p className="management-empty">
          Add a property first to upload its photos and prepare its listings.
        </p>
      ) : (
        <>
          <AppSelect
            className="publishing-property"
            label={<>Property</>}
            value={property.id}
            onValueChange={(value) => {
              setChosen(value);
              setMessage("");
            }}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.data.name} · {p.data.address}
              </option>
            ))}
          </AppSelect>
          <PhotoManager
            key={property.id}
            propertyId={property.id}
            photos={photos.filter((p) => p.propertyId === property.id)}
            onSaved={onSaved}
          />
          <section className="management-section">
            <h3>Publish your listing</h3>
            <p>
              Download the listing text and photos, then finish publishing in
              each account. This app does not automatically submit listings or
              synchronize changes with these sites.
            </p>
            <div className="management-actions">
              <a
                className="submit-button"
                href={`/api/admin/listings/${property.id}/export`}
              >
                Download listing & photos
              </a>
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      listingText(
                        property.data,
                        property.slug,
                        window.location.origin,
                      ),
                    );
                    setMessage("Listing text copied.");
                  } catch {
                    setMessage(
                      "Open the downloaded listing.txt to copy the text.",
                    );
                  }
                }}
              >
                Copy listing text
              </Button>
              {property.data.published && (
                <a
                  href={`/properties/${property.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View your listing
                </a>
              )}
            </div>
            {!property.data.published && (
              <p className="small-note">
                Your Back Acres listing is a draft. Publish it before sharing
                its listing or application link.
              </p>
            )}
            <div className="publication-list">
              {listingProviders.map((provider) => {
                const record = publications.find(
                    (p) =>
                      p.propertyId === property.id &&
                      p.provider === provider.id,
                  ),
                  outdated =
                    record &&
                    ["live", "submitted"].includes(record.status) &&
                    record.contentDigest !== property.publishingDigest;
                return (
                  <article key={provider.id} className="publication-row">
                    <div>
                      <h4>{provider.name}</h4>
                      <p>{provider.coverage}</p>
                      {outdated && (
                        <p className="form-error">
                          Listing details or photos changed. Update this site,
                          then confirm its status again.
                        </p>
                      )}
                    </div>
                    <a href={provider.url} target="_blank" rel="noreferrer">
                      Open {provider.name} ↗
                    </a>
                    <AppSelect
                      label={<>Your reported status</>}
                      aria-label={`${provider.name} publishing status`}
                      value={record?.status ?? "not_started"}
                      disabled={busy}
                      onValueChange={(value) => status(provider.id, value)}
                    >
                      <option value="not_started">Not started</option>
                      <option value="submitted">Submitted / in review</option>
                      <option value="live">Live — confirmed by me</option>
                      <option value="removed">Removed / off market</option>
                    </AppSelect>
                    {outdated && (
                      <Button
                        type="submit"
                        disabled={busy}
                        onClick={() => status(provider.id, record.status)}
                      >
                        I updated this listing
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
            <p className="small-note">
              Statuses are recorded by you. Network coverage and publishing
              eligibility are controlled by each provider. Avoid creating
              duplicate listings on sites already covered by your syndication
              account.
            </p>
            {message && <p role="status">{message}</p>}
          </section>
        </>
      )}
    </section>
  );
}
