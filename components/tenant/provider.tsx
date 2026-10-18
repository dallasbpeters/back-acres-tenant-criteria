"use client";
import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
export function TenantProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          card: { boxShadow: "none" },
          cardBox: { border: "1px solid var(--border)", boxShadow: "none" },
          footerActionLink: {
            color: "var(--ink)",
            textDecoration: "underline",
          },
          formFieldInput: {
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink)",
          },
          socialButtonsBlockButton: {
            borderColor: "var(--border)",
            color: "var(--ink)",
          },
        },
        variables: {
          borderRadius: "0.25rem",
          colorBackground: "var(--surface)",
          colorBorder: "var(--border)",
          colorForeground: "var(--ink)",
          colorInput: "var(--surface)",
          colorInputForeground: "var(--ink)",
          colorMutedForeground: "var(--muted)",
          colorPrimary: "#1154B3",
          colorPrimaryForeground: "#ffffff",
          fontFamily: "inherit",
        },
      }}
      signInFallbackRedirectUrl="/tenant"
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl="/tenant"
      signUpUrl="/sign-up"
    >
      {children}
    </ClerkProvider>
  );
}
