"use client";
import { ClerkProvider, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { type ReactNode, useEffect, useRef } from "react";

const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST
);

function TenantPostHogIdentity() {
  const { isLoaded, user } = useUser();
  const identifiedUserId = useRef<string | null>(null);
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress;

  useEffect(() => {
    if (!(isLoaded && posthogConfigured)) {
      return;
    }

    if (!userId) {
      if (identifiedUserId.current) {
        posthog.reset();
        identifiedUserId.current = null;
      }
      return;
    }

    if (identifiedUserId.current === userId) {
      return;
    }

    if (identifiedUserId.current) {
      posthog.reset();
    }

    posthog.identify(userId, email ? { email } : undefined);
    identifiedUserId.current = userId;
  }, [email, isLoaded, userId]);

  return null;
}

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
      <TenantPostHogIdentity />
      {children}
    </ClerkProvider>
  );
}
