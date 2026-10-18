// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
export function OwnerSignIn() {
  return (
    <div className="management-section">
      <p>Sign in with an approved owner Google account.</p>
      <Button
        className="submit-button"
        onClick={() => signIn("google", { callbackUrl: "/admin" })}
        type="submit"
      >
        Continue with Google
      </Button>
    </div>
  );
}
