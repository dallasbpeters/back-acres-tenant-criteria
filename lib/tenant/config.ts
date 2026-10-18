export function usesClerkConnect() {
  return (
    process.env.CLERK_AUTH_SOURCE === "vercel-connect" ||
    process.env.VERCEL === "1"
  );
}
export function tenantAuthReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      (usesClerkConnect()
        ? process.env.CLERK_ENCRYPTION_KEY
        : process.env.CLERK_SECRET_KEY)
  );
}
