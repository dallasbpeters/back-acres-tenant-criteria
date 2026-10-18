import "server-only";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "./google-auth";
import { isAllowedEmail } from "./access";

export async function authenticated() {
  if (
    !process.env.NEXTAUTH_SECRET ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  )
    return false;
  const session = await getServerSession(authOptions);
  return isAllowedEmail(session?.user?.email);
}
export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}
export async function guard(request: NextRequest) {
  if (!(await authenticated())) return reply({ error: "Please sign in." }, 401);
  if (request.method !== "GET" && !sameOrigin(request))
    return reply({ error: "Invalid origin." }, 403);
  return null;
}
export async function readBody(request: NextRequest, maxBytes = 64000) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Use JSON.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes)
    throw new Error("Notice is too large.");
  return JSON.parse(raw);
}
