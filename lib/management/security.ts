const pattern1 = /^[0-9a-f-]{36}$/;
const pattern2 = /^[0-9a-f]{64}$/;

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { intakeLimits } from "@/lib/db/schema";

function signature(value: string) {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error("Signing secret not configured.");
  }
  return createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(value)
    .digest("hex");
}
export function linkToken(
  kind: "maintenance" | "payment" | "autopay",
  id: string
) {
  return `${id}.${signature(`${kind}:${id}`)}`;
}
export function tokenId(
  kind: "maintenance" | "payment" | "autopay",
  token: string
) {
  const [id, sig, extra] = token.split(".");
  if (extra || !pattern1.test(id ?? "") || !pattern2.test(sig ?? "")) {
    return null;
  }
  return timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(signature(`${kind}:${id}`))
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
  const key = signature(`${scope}:${ip}:${Math.floor(now / 3_600_000)}`);
  const database = db();
  await database
    .delete(intakeLimits)
    .where(lt(intakeLimits.expiresAt, new Date(now)));
  const [row] = await database
    .insert(intakeLimits)
    .values({ count: 1, expiresAt: new Date(now + 3_600_000), key })
    .onConflictDoUpdate({
      set: { count: sql`${intakeLimits.count} + 1` },
      setWhere: sql`${intakeLimits.count} < 8`,
      target: intakeLimits.key,
    })
    .returning();
  return !!row;
}
export const siteUrl = () =>
  process.env.NEXTAUTH_URL || "http://localhost:3191";
