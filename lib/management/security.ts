import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { intakeLimits } from "@/lib/db/schema";
import type { NextRequest } from "next/server";
function signature(value: string) {
  if (!process.env.NEXTAUTH_SECRET)
    throw new Error("Signing secret not configured.");
  return createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(value)
    .digest("hex");
}
export function linkToken(
  kind: "maintenance" | "payment" | "autopay",
  id: string,
) {
  return `${id}.${signature(`${kind}:${id}`)}`;
}
export function tokenId(
  kind: "maintenance" | "payment" | "autopay",
  token: string,
) {
  const [id, sig, extra] = token.split(".");
  if (
    extra ||
    !/^[0-9a-f-]{36}$/.test(id ?? "") ||
    !/^[0-9a-f]{64}$/.test(sig ?? "")
  )
    return null;
  return timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(signature(`${kind}:${id}`)),
  )
    ? id
    : null;
}
export async function allowIntake(request: NextRequest, scope: string) {
  const ip =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local";
  const now = Date.now();
  const key = signature(`${scope}:${ip}:${Math.floor(now / 3600000)}`);
  const database = db();
  await database
    .delete(intakeLimits)
    .where(lt(intakeLimits.expiresAt, new Date(now)));
  const [row] = await database
    .insert(intakeLimits)
    .values({ key, count: 1, expiresAt: new Date(now + 3600000) })
    .onConflictDoUpdate({
      target: intakeLimits.key,
      set: { count: sql`${intakeLimits.count} + 1` },
      setWhere: sql`${intakeLimits.count} < 8`,
    })
    .returning();
  return !!row;
}
export const siteUrl = () =>
  process.env.NEXTAUTH_URL || "http://localhost:3191";
