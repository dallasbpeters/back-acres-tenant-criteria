"use client";
import { Button } from "@/components/ui/button";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
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
    if (!signature || method !== "draw") return;
    const element = signature.getCanvas();
    let previousWidth = 0,
      previousHeight = 0;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (
        !width ||
        !height ||
        (width === previousWidth && height === previousHeight)
      )
        return;
      const points = signature.toData();
      for (const group of points)
        for (const point of group) {
          if (previousWidth) point.x *= width / previousWidth;
          if (previousHeight) point.y *= height / previousHeight;
        }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      element.getContext("2d")!.setTransform(ratio, 0, 0, ratio, 0, 0);
      signature.clear();
      signature.fromData(points);
      previousWidth = width;
      previousHeight = height;
      onChange(signature.isEmpty() ? "" : signature.toDataURL("image/png"));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [method, onChange]);
  useEffect(() => {
    if (method === "draw") {
      if (disabled) canvas.current?.off();
      else canvas.current?.on();
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
    const context = image.getContext("2d")!;
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
          type="button"
          aria-pressed={method === "draw"}
          onClick={() => {
            if (method === "draw") return;
            setMethod("draw");
            setTyped("");
            onChange("");
          }}
        >
          Draw signature
        </Button>
        <Button
          type="button"
          aria-pressed={method === "type"}
          onClick={() => {
            if (method === "type") return;
            setTyped("");
            setMethod("type");
            onChange("");
          }}
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
            ref={canvas}
            penColor="#17241b"
            backgroundColor="#ffffff"
            clearOnResize={false}
            canvasProps={{
              width: 900,
              height: 280,
              className: "signature-canvas",
              "aria-label": "Draw your signature",
              "aria-describedby": "signature-help",
            }}
            onEnd={() =>
              onChange(
                canvas.current?.isEmpty()
                  ? ""
                  : (canvas.current?.toDataURL("image/png") ?? ""),
              )
            }
          />
          <Button
            type="button"
            onClick={() => {
              canvas.current?.clear();
              onChange("");
            }}
          >
            Clear signature
          </Button>
        </>
      ) : (
        <label className="field">
          Type your full name to adopt as your signature
          <input
            value={typed}
            onChange={(e) => typeSignature(e.target.value)}
            maxLength={150}
          />
          {typed && (
            <span className="typed-signature" aria-label="Signature preview">
              {typed}
            </span>
          )}
        </label>
      )}
    </fieldset>
  );
}
