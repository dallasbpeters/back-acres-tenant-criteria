// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

interface Branding {
  hasLogo: boolean;
  name: string;
  revision: string;
}
const initialBrand: Branding = {
  hasLogo: false,
  name: "Back Acres",
  revision: "",
};
export function useBranding() {
  const [brand, setBrand] = useState<Branding>(initialBrand);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/branding");
        if (!response.ok) {
          return;
        }
        const value: Branding = await response.json();
        if (active) {
          setBrand(value);
        }
      } catch {
        /* Best-effort fallback: retain the original result when this optional operation fails. */
      }
    };
    load();
    window.addEventListener("branding-updated", load);
    return () => {
      active = false;
      window.removeEventListener("branding-updated", load);
    };
  }, []);
  return brand;
}
export function BrandLogoImage({ brand }: { brand: Branding }) {
  const [failedRevision, setFailedRevision] = useState<string | null>(null);
  if (!brand.hasLogo || failedRevision === brand.revision) {
    return null;
  }

  return (
    <Image
      alt={`${brand.name} logo`}
      className="brand-logo"
      height={48}
      onError={() => setFailedRevision(brand.revision)}
      src={`/api/branding/logo?v=${encodeURIComponent(brand.revision)}`}
      unoptimized
      width={48}
    />
  );
}
export function BrandLogo() {
  return <BrandLogoImage brand={useBranding()} />;
}
