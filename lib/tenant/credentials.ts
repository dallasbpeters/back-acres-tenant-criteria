import "server-only";
import { getToken } from "@vercel/connect";
import { usesClerkConnect } from "./config";

export const clerkConnector = "clerk/back-acres";

export async function clerkSecretKey() {
  // Vercel deployments use the app-scoped connection. Never fall back to an
  // unrelated environment key when Connect is unavailable or misconfigured.
  const key = usesClerkConnect()
    ? await getToken(clerkConnector, { subject: { type: "app" } })
    : process.env.CLERK_SECRET_KEY;
  if (!(key?.startsWith("sk_test_") || key?.startsWith("sk_live_"))) {
    throw new Error("Clerk requires an application secret key.");
  }
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const matchingMode = key.startsWith("sk_live_")
    ? publishableKey?.startsWith("pk_live_")
    : publishableKey?.startsWith("pk_test_");
  if (!matchingMode) {
    throw new Error(
      "Clerk public and secret keys must use the same environment."
    );
  }
  return key;
}
