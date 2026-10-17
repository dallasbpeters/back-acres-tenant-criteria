"use client";
import { useRef, useState } from "react";
export type PhotoRecord = {
  id: string;
  propertyId: string;
  caption: string;
  position: number;
  archived: boolean;
  url: string;
};
async function preparePhoto(file: File) {
  if (file.size > 20_000_000)
    throw Error(`${file.name}: choose a photo under 20 MB.`);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(`${file.name}: use JPEG, PNG, or WebP.`);
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Could not prepare photo."))),
      "image/jpeg",
      0.87,
    ),
  );
  if (blob.size > 4_000_000)
    throw Error(`${file.name}: this photo is too large after resizing.`);
  return blob;
}
export function PhotoManager({
  propertyId,
  photos,
  onSaved,
}: {
  propertyId: string;
  photos: PhotoRecord[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = photos.filter((p) => !p.archived),
    removed = photos.filter((p) => p.archived);
  async function update(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
        result = await r.json();
      if (!r.ok) throw Error(result.error);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save photos.");
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, direction: number) {
    const ids = active.map((p) => p.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    update({ action: "order", propertyId, ids });
  }
  return (
    <section className="photo-manager" aria-label="Listing photos">
      <div className="section-heading-row">
        <div>
          <h3>Listing photos</h3>
          <p className="small-note">
            {active.length} of 24 photos · first photo is the cover
          </p>
        </div>
        <button
          type="button"
          disabled={busy || active.length >= 24}
          onClick={() => input.current?.click()}
        >
          Add photos
        </button>
      </div>
      <input
        ref={input}
        className="visually-hidden"
        aria-label="Upload listing photos"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length + active.length > 24) {
            setError("Choose enough photos to keep the listing under 24.");
            e.target.value = "";
            return;
          }
          setBusy(true);
          setError("");
          try {
            for (const [i, file] of files.entries()) {
              setMessage(`Uploading photo ${i + 1} of ${files.length}…`);
              const data = new FormData();
              data.set("propertyId", propertyId);
              data.set("file", await preparePhoto(file), "photo.jpg");
              const r = await fetch("/api/admin/photos", {
                  method: "POST",
                  body: data,
                }),
                result = await r.json();
              if (!r.ok) throw Error(result.error);
            }
            setMessage("Photos uploaded.");
          } catch (error) {
            setError(error instanceof Error ? error.message : "Upload failed.");
            setMessage("");
          } finally {
            e.target.value = "";
            await onSaved().catch(() =>
              setError("Reload to see the latest photos."),
            );
            setBusy(false);
          }
        }}
      />
      {!active.length && (
        <p className="management-empty">
          Add exterior and room photos to show renters the property. JPEG, PNG,
          or WebP; up to 20 MB each before resizing.
        </p>
      )}
      <div className="photo-edit-grid">
        {active.map((p, i) => (
          <div className="photo-edit-item" key={p.id}>
            <img
              src={p.url}
              alt={p.caption || `Listing photo ${i + 1}`}
              loading="lazy"
            />
            <span className="photo-number">
              {i === 0 ? "Cover photo" : `Photo ${i + 1}`}
            </span>
            <label className="field">
              Photo caption
              <input
                aria-label={`Caption for photo ${i + 1}`}
                defaultValue={p.caption}
                maxLength={300}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== p.caption)
                    update({
                      action: "caption",
                      id: p.id,
                      caption: e.target.value,
                    });
                }}
              />
            </label>
            <div className="management-actions">
              <button
                type="button"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move photo ${i + 1} earlier`}
              >
                ←
              </button>
              <button
                type="button"
                disabled={busy || i === active.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move photo ${i + 1} later`}
              >
                →
              </button>
              {i > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    update({
                      action: "order",
                      propertyId,
                      ids: [
                        p.id,
                        ...active.filter((x) => x.id !== p.id).map((x) => x.id),
                      ],
                    })
                  }
                >
                  Make cover
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  update({ action: "archive", id: p.id, archived: true })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {!!removed.length && (
        <details>
          <summary>Removed photos ({removed.length})</summary>
          <div className="photo-edit-grid">
            {removed.map((p) => (
              <div className="photo-edit-item" key={p.id}>
                <img
                  src={p.url}
                  alt={p.caption || "Removed listing photo"}
                  loading="lazy"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    update({ action: "archive", id: p.id, archived: false })
                  }
                >
                  Restore photo
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function ListingGallery({
  photos,
  name,
}: {
  photos: Pick<PhotoRecord, "id" | "url" | "caption">[];
  name: string;
}) {
  const [selected, setSelected] = useState("");
  const current = photos.find((p) => p.id === selected) ?? photos[0];
  if (!current) return null;
  return (
    <section className="listing-gallery" aria-label="Property photos">
      <figure>
        <img
          className="listing-main-photo"
          src={current.url}
          alt={current.caption || `${name} property photo`}
        />
        {current.caption && <figcaption>{current.caption}</figcaption>}
      </figure>
      {photos.length > 1 && (
        <div className="listing-thumbnails">
          {photos.map((p, i) => (
            <button
              type="button"
              key={p.id}
              aria-label={`View photo ${i + 1}${p.caption ? `: ${p.caption}` : ""}`}
              aria-pressed={current.id === p.id}
              onClick={() => setSelected(p.id)}
            >
              <img src={p.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
