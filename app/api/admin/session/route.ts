import { authenticated, reply } from "@/lib/adverse/auth";
export async function GET() {
  return reply({ authenticated: await authenticated() });
}
// Shared-password sessions are retired. Existing password cookies confer no access.
export async function POST() {
  return reply({ error: "Use Google sign-in." }, 410);
}
