"use client";
import { useEffect, useState } from "react";
import { ChromaFlow, ImageTexture, Shader, SolidColor } from "shaders/react";

export default function PixelReveal2() {
  const [resolvedColor, setResolvedColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#ffffff");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const readColors = () => {
      const styles = getComputedStyle(root);
      const themeColor = styles.getPropertyValue("--surface").trim();
      const flowColor = styles.getPropertyValue("--accent").trim();
      setIsDark(root.dataset.theme === "dark");
      if (flowColor) {
        setAccentColor(flowColor);
      }
      if (themeColor) {
        setResolvedColor(themeColor);
      }
    };
    readColors();
    // The theme control switches tokens through <html data-theme>.
    const observer = new MutationObserver(readColors);
    observer.observe(root, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Shader
      style={{
        height: "100%",
        position: "fixed",
        width: "100%",
        zIndex: 0,
      }}
    >
      <ChromaFlow
        baseColor={accentColor}
        downColor={accentColor}
        id="idmostv5d9xi2rmvn45"
        intensity={1}
        leftColor={accentColor}
        momentum={32}
        radius={4}
        rightColor={accentColor}
        upColor={accentColor}
        visible={false}
      />
      <SolidColor color={resolvedColor} maskSource="idmostv5d9xi2rmvn45" />
      <ImageTexture
        boundingBox={{
          height: { unit: "px", value: 2560 },
          origin: "center",
          width: { unit: "px", value: 3840 },
        }}
        maskSource="idmostv5d9xi2rmvn45"
        objectFit="cover"
        url={isDark ? "/shaders/clouds-night.jpeg" : "/shaders/clouds.jpeg"}
      />
    </Shader>
  );
}
