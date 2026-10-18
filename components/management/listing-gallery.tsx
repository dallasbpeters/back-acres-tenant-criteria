"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import type { PhotoRecord } from "./photos";

export function ListingGallery({
  photos,
  name,
}: {
  photos: Pick<PhotoRecord, "id" | "url" | "caption">[];
  name: string;
}) {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const touchStart = useRef<number | null>(null);
  useEffect(() => {
    if (!open || photos.length < 2) return;
    const browse = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        setSelected(
          (index) => (index + direction + photos.length) % photos.length,
        );
      }
    };
    window.addEventListener("keydown", browse);
    return () => window.removeEventListener("keydown", browse);
  }, [open, photos.length]);
  const current = photos[selected] ?? photos[0];
  if (!current) return null;
  const move = (direction: number) =>
    setSelected((index) => (index + direction + photos.length) % photos.length);
  return (
    <section className="listing-gallery" aria-label="Property photos">
      <div
        className={`listing-photo-grid listing-photo-grid--${Math.min(photos.length, 5)}`}
      >
        {photos.slice(0, 5).map((photo, index) => (
          <Button
            key={photo.id}
            className="listing-photo-tile"
            aria-label={`View photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
            onPress={() => {
              setSelected(index);
              setOpen(true);
            }}
          >
            <img
              src={photo.url}
              alt=""
              loading={index === 0 ? "eager" : "lazy"}
            />
            {index === 4 && photos.length > 5 && (
              <span className="listing-photo-more">
                +{photos.length - 5} photos
              </span>
            )}
          </Button>
        ))}
      </div>
      <div className="listing-gallery-footer">
        <span>
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </span>
        <Button
          onPress={() => {
            setSelected(0);
            setOpen(true);
          }}
        >
          View all photos
        </Button>
      </div>
      <ModalOverlay
        className="listing-photo-overlay"
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable
      >
        <Modal className="listing-photo-modal">
          <Dialog className="listing-photo-dialog">
            <div className="listing-photo-toolbar">
              <Heading slot="title">{name} · Photos</Heading>
              <Button onPress={() => setOpen(false)} aria-label="Close photos">
                Close ×
              </Button>
            </div>
            <figure className="listing-photo-viewer">
              <div
                className="listing-photo-stage"
                onTouchStart={(event) => {
                  touchStart.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const start = touchStart.current;
                  touchStart.current = null;
                  const end = event.changedTouches[0]?.clientX;
                  if (
                    start !== null &&
                    end !== undefined &&
                    Math.abs(end - start) > 50
                  )
                    move(end < start ? 1 : -1);
                }}
              >
                <img
                  src={current.url}
                  alt={
                    current.caption || `${name} property photo ${selected + 1}`
                  }
                />
              </div>
              <figcaption aria-live="polite" aria-atomic="true">
                <span>
                  Photo {selected + 1} of {photos.length}
                </span>
                {current.caption && <span>{current.caption}</span>}
              </figcaption>
            </figure>
            {photos.length > 1 && (
              <div className="listing-photo-controls">
                <Button onPress={() => move(-1)} aria-label="Previous photo">
                  ← Previous
                </Button>
                <p>Use the arrow keys or swipe to browse.</p>
                <Button onPress={() => move(1)} aria-label="Next photo">
                  Next →
                </Button>
              </div>
            )}
            {photos.length > 1 && (
              <div
                className="listing-photo-filmstrip"
                aria-label="Choose photo"
              >
                {photos.map((photo, index) => (
                  <Button
                    key={photo.id}
                    className="listing-photo-thumb"
                    aria-label={`Show photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
                    aria-pressed={index === selected}
                    onPress={() => setSelected(index)}
                  >
                    <img src={photo.url} alt="" loading="lazy" />
                  </Button>
                ))}
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </section>
  );
}
