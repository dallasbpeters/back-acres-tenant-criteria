"use client";

import { useEffect, useState } from "react";

type Branding = { name: string; hasLogo: boolean; revision: string };
const initialBrand: Branding = { name: "Back Acres", hasLogo: false, revision: "" };

export function useBranding() {
  const [brand, setBrand] = useState<Branding>(initialBrand);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/branding");
        if (!response.ok) return;
        const value: Branding = await response.json();
        if (active) setBrand(value);
      } catch {}
    };
    void load();
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
  if (!brand.hasLogo || failedRevision === brand.revision) return null;
  return (
    <img
      className="brand-logo"
      src={`/api/branding/logo?v=${encodeURIComponent(brand.revision)}`}
      alt={`${brand.name} logo`}
      width={48}
      height={48}
      onError={() => setFailedRevision(brand.revision)}
    />
  );
}

export function BrandLogo() {
  return <BrandLogoImage brand={useBranding()} />;
}
