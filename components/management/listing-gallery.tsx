// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
    if (!open || photos.length < 2) {
      return;
    }
    const browse = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        setSelected(
          (index) => (index + direction + photos.length) % photos.length
        );
      }
    };
    window.addEventListener("keydown", browse);
    return () => window.removeEventListener("keydown", browse);
  }, [open, photos.length]);
  const current = photos[selected] ?? photos[0];
  if (!current) {
    return null;
  }
  const move = (direction: number) =>
    setSelected((index) => (index + direction + photos.length) % photos.length);

  return (
    <section aria-label="Property photos" className="listing-gallery">
      <div
        className={`listing-photo-grid listing-photo-grid--${Math.min(photos.length, 5)}`}
      >
        {photos.slice(0, 5).map((photo, index) => (
          <Button
            aria-label={`View photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
            className="listing-photo-tile"
            key={photo.id}
            onPress={() => {
              setSelected(index);
              setOpen(true);
            }}
          >
            <Image
              alt=""
              height={800}
              loading={index === 0 ? "eager" : "lazy"}
              src={photo.url}
              unoptimized
              width={1200}
            />
            {!!(index === 4 && photos.length > 5) && (
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
          <Icon name="photos" />
          View all photos
        </Button>
      </div>
      <ModalOverlay
        className="listing-photo-overlay"
        isDismissable
        isOpen={open}
        onOpenChange={setOpen}
      >
        <Modal className="listing-photo-modal">
          <Dialog className="listing-photo-dialog">
            <div className="listing-photo-toolbar">
              <Heading slot="title">{name} · Photos</Heading>
              <Button
                aria-label="Close photos"
                className="icon-button"
                onPress={() => setOpen(false)}
                title="Close photos"
              >
                <Icon name="close" size={24} />
              </Button>
            </div>
            <figure className="listing-photo-viewer">
              <div
                className="listing-photo-stage"
                onTouchEnd={(event) => {
                  const start = touchStart.current;
                  touchStart.current = null;
                  const end = event.changedTouches[0]?.clientX;
                  if (
                    start !== null &&
                    end !== undefined &&
                    Math.abs(end - start) > 50
                  ) {
                    move(end < start ? 1 : -1);
                  }
                }}
                onTouchStart={(event) => {
                  touchStart.current = event.touches[0]?.clientX ?? null;
                }}
              >
                <Image
                  alt={
                    current.caption || `${name} property photo ${selected + 1}`
                  }
                  height={800}
                  src={current.url}
                  unoptimized
                  width={1200}
                />
              </div>
              <figcaption aria-atomic="true" aria-live="polite">
                <span>
                  Photo {selected + 1} of {photos.length}
                </span>
                {!!current.caption && <span>{current.caption}</span>}
              </figcaption>
            </figure>
            {!!(photos.length > 1) && (
              <div className="listing-photo-controls">
                <Button aria-label="Previous photo" onPress={() => move(-1)}>
                  <Icon name="back" />
                  Previous
                </Button>
                <p>Use the arrow keys or swipe to browse.</p>
                <Button aria-label="Next photo" onPress={() => move(1)}>
                  Next
                  <Icon name="next" />
                </Button>
              </div>
            )}
            {!!(photos.length > 1) && (
              <section
                aria-label="Choose photo"
                className="listing-photo-filmstrip"
              >
                {photos.map((photo, index) => (
                  <Button
                    aria-label={`Show photo ${index + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
                    aria-pressed={index === selected}
                    className="listing-photo-thumb"
                    key={photo.id}
                    onPress={() => setSelected(index)}
                  >
                    <Image
                      alt=""
                      height={800}
                      loading="lazy"
                      src={photo.url}
                      unoptimized
                      width={1200}
                    />
                  </Button>
                ))}
              </section>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </section>
  );
}
