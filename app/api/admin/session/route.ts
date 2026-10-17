import { NextRequest } from "next/server";
import {
  authenticated,
  cookieName,
  passwordMatches,
  readBody,
  reply,
  sameOrigin,
  sessionToken,
} from "@/lib/adverse/auth";
export async function GET() {
  return reply({ authenticated: await authenticated() });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  try {
    const body = await readBody(request);
    if (
      !passwordMatches(typeof body.password === "string" ? body.password : "")
    )
      return reply(
        { error: "The access password is incorrect or not configured." },
        401,
      );
    const response = reply({ ok: true });
    response.cookies.set(cookieName, sessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return response;
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  const response = reply({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
