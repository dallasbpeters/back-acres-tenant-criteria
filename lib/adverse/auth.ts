import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
export const cookieName = "back_acres_admin";
function sign(s: string) {
  return createHmac("sha256", process.env.ADMIN_PASSWORD!)
    .update(s)
    .digest("hex");
}
export function passwordMatches(input: string) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 32) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sessionToken() {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expires}.${sign(expires)}`;
}
export async function authenticated() {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 32)
    return false;
  const token = (await cookies()).get(cookieName)?.value || "";
  const [expires, signature] = token.split(".");
  if (
    !expires ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^\d+$/.test(expires) ||
    Number(expires) <= Date.now()
  )
    return false;
  const expected = sign(expires);
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
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
export async function readBody(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Use JSON.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 64000) throw new Error("Notice is too large.");
  return JSON.parse(raw);
}
