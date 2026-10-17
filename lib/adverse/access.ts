/** Exact email matches only; no domain-wide access or Gmail alias expansion. */
export function allowedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured =
    env.ADMIN_EMAILS ??
    [env.LANDLORD_EMAIL, env.TANDRA_EMAIL].filter(Boolean).join(",");
  return [
    ...new Set(
      configured
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
export function isAllowedEmail(
  email: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    typeof email === "string" &&
    allowedEmails(env).includes(email.trim().toLowerCase())
  );
}
export function canSignIn(
  provider: unknown,
  profile: { email?: unknown; email_verified?: unknown } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    provider === "google" &&
    profile?.email_verified === true &&
    isAllowedEmail(profile.email, env)
  );
}
