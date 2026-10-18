import "server-only";
import { createClerkClient } from "@clerk/nextjs/server";
import { clerkSecretKey } from "./credentials";

export async function tenantClerkClient() {
  return createClerkClient({ secretKey: await clerkSecretKey() });
}
