import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaseSigners } from "@/lib/db/schema";

// Read only the named landlord contacts, never another tenant's signing details.
export async function leaseContact(packetId: string, brandName: string) {
  const contacts = await db()
    .select({ email: leaseSigners.email, name: leaseSigners.name })
    .from(leaseSigners)
    .where(
      and(
        eq(leaseSigners.packetId, packetId),
        eq(leaseSigners.role, "landlord")
      )
    )
    .orderBy(leaseSigners.id);
  return contacts.length
    ? contacts
        .map((contact) => `${contact.name} (${contact.email})`)
        .join(" or ")
    : brandName;
}
