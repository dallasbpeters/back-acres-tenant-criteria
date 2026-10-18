"use client";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortablePhoto({
  photo,
  index,
  busy,
  onCaption,
  onRemove,
}: {
  photo: PhotoRecord;
  index: number;
  busy: boolean;
  onCaption: (caption: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id, disabled: busy });
  return (
    <div
      ref={setNodeRef}
      data-photo-id={photo.id}
      className={`photo-edit-item${isDragging ? " photo-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="photo-preview">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="photo-drag-target"
          disabled={busy}
          {...attributes}
          {...listeners}
          aria-label={`Reorder photo ${index + 1}`}
        >
          <img
            src={photo.url}
            alt={photo.caption || `Listing photo ${index + 1}`}
            loading="lazy"
            draggable={false}
          />
          <span className="photo-drag-hint" aria-hidden="true">
            ⠿
          </span>
        </button>
        <Button
          type="button"
          className="photo-remove"
          disabled={busy || isDragging}
          onClick={onRemove}
          aria-label={`Remove photo ${index + 1}`}
          title="Remove photo"
        >
          <Icon name="close" size={18} />
        </Button>
      </div>
      <span className="photo-number">
        {index === 0 ? "Cover photo" : `Photo ${index + 1}`}
      </span>
      <label className="field">
        Photo caption
        <input
          aria-label={`Caption for photo ${index + 1}`}
          defaultValue={photo.caption}
          maxLength={300}
          disabled={busy}
          onBlur={(e) => {
            if (e.target.value !== photo.caption) onCaption(e.target.value);
          }}
        />
      </label>
    </div>
  );
}
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
    [error, setError] = useState(""),
    [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const input = useRef<HTMLInputElement>(null);
  const savedActive = photos.filter((p) => !p.archived);
  const active = pendingOrder
      ? [...savedActive].sort(
          (a, b) => pendingOrder.indexOf(a.id) - pendingOrder.indexOf(b.id),
        )
      : savedActive,
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
      setMessage("Photo changes saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save photos.");
    } finally {
      setPendingOrder(null);
      setBusy(false);
    }
  }
  function reorder(from: string, to: string) {
    if (busy || from === to) return;
    const oldIndex = active.findIndex((p) => p.id === from),
      newIndex = active.findIndex((p) => p.id === to);
    if (oldIndex < 0 || newIndex < 0) return;
    const ids = arrayMove(active, oldIndex, newIndex).map((p) => p.id);
    setPendingOrder(ids);
    update({ action: "order", propertyId, ids });
  }
  return (
    <section className="photo-manager" aria-label="Listing photos">
      <div className="section-heading-row">
        <div>
          <h3>Listing photos</h3>
          <p className="small-note">
            {active.length} of 24 photos · drag to rearrange · first photo is
            the cover
          </p>
        </div>
        <Button
          type="button"
          disabled={busy || active.length >= 24}
          onClick={() => input.current?.click()}
        >
          Add photos
        </Button>
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
      <DndContext
        id={`listing-photos-${propertyId}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder a photo, press Space to pick it up, use the arrow keys to move, then press Space to drop. Press Escape to cancel.",
          },
        }}
        onDragEnd={({ active: dragged, over }) => {
          if (over) reorder(String(dragged.id), String(over.id));
        }}
      >
        <SortableContext
          items={active.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="photo-edit-grid">
            {active.map((p, i) => (
              <SortablePhoto
                key={p.id}
                photo={p}
                index={i}
                busy={busy}
                onCaption={(caption) =>
                  update({ action: "caption", id: p.id, caption })
                }
                onRemove={() =>
                  update({ action: "archive", id: p.id, archived: true })
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    update({ action: "archive", id: p.id, archived: false })
                  }
                >
                  Restore photo
                </Button>
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
