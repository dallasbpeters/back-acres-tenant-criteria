"use client";
import { useState } from "react";
import type { PhotoRecord } from "./photos";
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
