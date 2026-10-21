// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SectionCard } from "./section-card";

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
  } = useSortable({ disabled: busy, id: photo.id });

  return (
    <div
      className={["photo-edit-item", isDragging ? "photo-dragging" : ""]
        .filter(Boolean)
        .join(" ")}
      data-photo-id={photo.id}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="photo-preview">
        <button
          className="photo-drag-target"
          disabled={busy}
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder photo ${index + 1}`}
        >
          <Image
            alt={photo.caption || `Listing photo ${index + 1}`}
            draggable={false}
            height={800}
            loading="lazy"
            src={photo.url}
            unoptimized
            width={1200}
          />
          <span aria-hidden="true" className="photo-drag-hint">
            ⠿
          </span>
        </button>
        <Button
          aria-label={`Remove photo ${index + 1}`}
          className="photo-remove"
          disabled={busy || isDragging}
          onClick={onRemove}
          title="Remove photo"
          type="button"
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
          disabled={busy}
          maxLength={300}
          onBlur={(e) => {
            if (e.target.value !== photo.caption) {
              onCaption(e.target.value);
            }
          }}
        />
      </label>
    </div>
  );
}
export interface PhotoRecord {
  archived: boolean;
  caption: string;
  id: string;
  position: number;
  propertyId: string;
  url: string;
}
async function preparePhoto(file: File) {
  if (file.size > 20_000_000) {
    throw new Error(`${file.name}: choose a photo under 20 MB.`);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(`${file.name}: use JPEG, PNG, or WebP.`);
  }
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not prepare the photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not prepare photo."))),
      "image/jpeg",
      0.87
    )
  );
  if (blob.size > 4_000_000) {
    throw new Error(`${file.name}: this photo is too large after resizing.`);
  }
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
    })
  );
  const input = useRef<HTMLInputElement>(null);
  const savedActive = photos.filter((p) => !p.archived);
  const active = pendingOrder
      ? [...savedActive].sort(
          (a, b) => pendingOrder.indexOf(a.id) - pendingOrder.indexOf(b.id)
        )
      : savedActive,
    removed = photos.filter((p) => p.archived);
  async function update(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/photos", {
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }),
        result = await r.json();
      if (!r.ok) {
        throw new Error(result.error);
      }
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
    if (busy || from === to) {
      return;
    }
    const oldIndex = active.findIndex((p) => p.id === from),
      newIndex = active.findIndex((p) => p.id === to);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const ids = arrayMove(active, oldIndex, newIndex).map((p) => p.id);
    setPendingOrder(ids);
    update({ action: "order", ids, propertyId });
  }

  return (
    <SectionCard className="photo-manager" labelledBy="photos-heading">
      <div className="section-heading-row">
        <div>
          <h3 id="photos-heading">Listing photos</h3>
          <p className="small-note">
            {active.length} of 24 photos · drag to rearrange · first photo is
            the cover
          </p>
        </div>
        <Button
          disabled={busy || active.length >= 24}
          onClick={() => input.current?.click()}
          type="button"
        >
          Add photos
        </Button>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload listing photos"
        className="visually-hidden"
        disabled={busy}
        multiple
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
              data.set(
                "file",
                /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await preparePhoto(
                  file
                ),
                "photo.jpg"
              );
              const r = await fetch("/api/admin/photos", {
                  body: data,
                  method: "POST",
                }),
                result = await r.json();
              if (!r.ok) {
                throw new Error(result.error);
              }
            }
            setMessage("Photos uploaded.");
          } catch (errorLocal) {
            setError(
              errorLocal instanceof Error
                ? errorLocal.message
                : "Upload failed."
            );
            setMessage("");
          } finally {
            e.target.value = "";
            await onSaved().catch(() =>
              setError("Reload to see the latest photos.")
            );
            setBusy(false);
          }
        }}
        ref={input}
        type="file"
      />
      {!active.length && (
        <p className="management-empty">
          Add exterior and room photos to show renters the property. JPEG, PNG,
          or WebP; up to 20 MB each before resizing.
        </p>
      )}
      <DndContext
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder a photo, press Space to pick it up, use the arrow keys to move, then press Space to drop. Press Escape to cancel.",
          },
        }}
        collisionDetection={closestCenter}
        id={`listing-photos-${propertyId}`}
        onDragEnd={({ active: dragged, over }) => {
          if (over) {
            reorder(String(dragged.id), String(over.id));
          }
        }}
        sensors={sensors}
      >
        <SortableContext
          items={active.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="photo-edit-grid">
            {active.map((p, i) => (
              <SortablePhoto
                busy={busy}
                index={i}
                key={p.id}
                onCaption={(caption) =>
                  update({ action: "caption", caption, id: p.id })
                }
                onRemove={() =>
                  update({ action: "archive", archived: true, id: p.id })
                }
                photo={p}
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
                <Image
                  alt={p.caption || "Removed listing photo"}
                  height={800}
                  loading="lazy"
                  src={p.url}
                  unoptimized
                  width={1200}
                />
                <Button
                  disabled={busy}
                  onClick={() =>
                    update({ action: "archive", archived: false, id: p.id })
                  }
                  type="button"
                >
                  Restore photo
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
      {!!message && <p role="status">{message}</p>}
      {!!error && <p role="alert">{error}</p>}
    </SectionCard>
  );
}
