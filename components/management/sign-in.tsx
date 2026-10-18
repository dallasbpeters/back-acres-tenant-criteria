"use client";
import { Button } from "@/components/ui/button";

import { signIn } from "next-auth/react";
export function OwnerSignIn() {
  return (
    <div className="management-section">
      <p>Sign in with an approved owner Google account.</p>
      <Button
        type="submit"
        className="submit-button"
        onClick={() => signIn("google", { callbackUrl: "/admin" })}
      >
        Continue with Google
      </Button>
    </div>
  );
}
