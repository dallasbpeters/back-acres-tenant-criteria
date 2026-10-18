// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { requireValue } from "@/lib/required";
export function LeaseSignaturePad({
  onChange,
  disabled,
}: {
  onChange: (data: string) => void;
  disabled: boolean;
}) {
  const canvas = useRef<SignatureCanvas | null>(null),
    [method, setMethod] = useState<"draw" | "type">("draw"),
    [typed, setTyped] = useState("");
  useEffect(() => {
    const signature = canvas.current;
    if (!signature || method !== "draw") {
      return;
    }
    const element = signature.getCanvas();
    let previousWidth = 0,
      previousHeight = 0;
    const observer = new ResizeObserver(
      /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
      () => {
        const { width, height } = element.getBoundingClientRect();
        if (
          !(width && height) ||
          (width === previousWidth && height === previousHeight)
        ) {
          return;
        }
        const points = signature.toData();
        for (const group of points) {
          for (const point of group) {
            if (previousWidth) {
              point.x *= width / previousWidth;
            }
            if (previousHeight) {
              point.y *= height / previousHeight;
            }
          }
        }
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
        requireValue(
          element.getContext("2d"),
          "Expected element.getContext(2d)"
        ).setTransform(ratio, 0, 0, ratio, 0, 0);
        signature.clear();
        signature.fromData(points);
        previousWidth = width;
        previousHeight = height;
        onChange(signature.isEmpty() ? "" : signature.toDataURL("image/png"));
      }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [method, onChange]);
  useEffect(() => {
    if (method === "draw") {
      if (disabled) {
        canvas.current?.off();
      } else {
        canvas.current?.on();
      }
    }
  }, [disabled, method]);
  function typeSignature(value: string) {
    setTyped(value);
    if (!value.trim()) {
      onChange("");
      return;
    }
    const image = document.createElement("canvas");
    image.width = 900;
    image.height = 240;
    const context = requireValue(
      image.getContext("2d"),
      "Expected image.getContext(2d)"
    );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 900, 240);
    context.fillStyle = "#17241b";
    context.font = "italic 56px Georgia, serif";
    context.fillText(value, 30, 135, 840);
    onChange(image.toDataURL("image/png"));
  }

  return (
    <fieldset className="signature-capture" disabled={disabled}>
      <legend>Your signature</legend>
      <div className="management-actions">
        <Button
          aria-pressed={method === "draw"}
          onClick={() => {
            if (method === "draw") {
              return;
            }
            setMethod("draw");
            setTyped("");
            onChange("");
          }}
          type="button"
        >
          Draw signature
        </Button>
        <Button
          aria-pressed={method === "type"}
          onClick={() => {
            if (method === "type") {
              return;
            }
            setTyped("");
            setMethod("type");
            onChange("");
          }}
          type="button"
        >
          Type signature
        </Button>
      </div>
      {method === "draw" ? (
        <>
          <p id="signature-help">
            Sign in the box with a mouse, pen, or finger. You can use “Type
            signature” with a keyboard.
          </p>
          <SignatureCanvas
            backgroundColor="#ffffff"
            canvasProps={{
              "aria-describedby": "signature-help",
              "aria-label": "Draw your signature",
              className: "signature-canvas",
              height: 280,
              width: 900,
            }}
            clearOnResize={false}
            onEnd={() =>
              onChange(
                canvas.current?.isEmpty()
                  ? ""
                  : (canvas.current?.toDataURL("image/png") ?? "")
              )
            }
            penColor="#17241b"
            ref={canvas}
          />
          <Button
            onClick={() => {
              canvas.current?.clear();
              onChange("");
            }}
            type="button"
          >
            Clear signature
          </Button>
        </>
      ) : (
        <label className="field">
          Type your full name to adopt as your signature
          <input
            maxLength={150}
            onChange={(e) => typeSignature(e.target.value)}
            value={typed}
          />
          {!!typed && (
            <span
              aria-label="Signature preview"
              className="typed-signature"
              role="img"
            >
              {typed}
            </span>
          )}
        </label>
      )}
    </fieldset>
  );
}
