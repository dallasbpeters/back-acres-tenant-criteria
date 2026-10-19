import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoices,
  leaseDrafts,
  leasePackets,
  leaseSigners,
  tenantAccess,
  tenantInvitations,
} from "@/lib/db/schema";
import { paymentMode, paymentReady } from "@/lib/management/stripe";
import { digest } from "./signing-model";

const notMoney = /[^0-9.]/g;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const kinds = [
  {
    description: "Security deposit",
    field: "security_deposit",
    key: "security",
  },
  { description: "Pet deposit", field: "pet_deposit", key: "pet" },
] as const;

/** A stable id per lease and deposit kind, so creating twice is a no-op. */
function depositId(packetId: string, key: string) {
  const h = digest(`lease-deposit:${packetId}:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const cents = (value: unknown) => {
  const amount = Number(String(value ?? "").replace(notMoney, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

/**
 * When a lease is fully signed, requests its security and pet deposits from
 * the tenants (bank transfer only). Safe to run more than once.
 */
export async function createLeaseDeposits(packetId: string) {
  if (!paymentReady()) {
    return [];
  }
  const d = db();
  const [lease] = await d
    .select({ draft: leaseDrafts, status: leasePackets.status })
    .from(leasePackets)
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(eq(leasePackets.id, packetId));
  if (lease?.status !== "completed") {
    return [];
  }
  const tenants = await d
    .select()
    .from(leaseSigners)
    .where(
      and(eq(leaseSigners.packetId, packetId), eq(leaseSigners.role, "tenant"))
    );
  const payer = tenants.find((t) => t.email) ?? tenants[0];
  if (!payer) {
    return [];
  }
  const values = (lease.draft.values ?? {}) as Record<string, unknown>;
  const today = new Date().toISOString().slice(0, 10);
  const start = String(values.start_date ?? "");
  const dueDate = isoDate.test(start) && start >= today ? start : today;
  const rows = kinds
    .map((kind) => ({
      amountCents: cents(values[kind.field]),
      category: "deposit",
      description: kind.description,
      dueDate,
      id: depositId(packetId, kind.key),
      mode: paymentMode(),
      payerEmail: payer.email ?? "",
      payerName: tenants.map((t) => t.name).join(" and "),
      propertyId: lease.draft.propertyId,
    }))
    .filter((row) => row.amountCents >= 50);
  if (!rows.length) {
    return [];
  }
  await d.insert(invoices).values(rows).onConflictDoNothing();
  for (const tenant of tenants) {
    // biome-ignore lint/performance/noAwaitInLoops: Tenants may share one access row; update in order.
    await shareLeaseDeposits(packetId, tenant);
  }
  return rows.map((row) => row.id);
}

/**
 * Shows a lease's deposit requests to one tenant: on their portal access,
 * or on their pending invitation until they sign up.
 */
export async function shareLeaseDeposits(
  packetId: string,
  tenant: { clerkUserId: string | null; email: string | null }
) {
  const d = db();
  const ids = kinds.map((kind) => depositId(packetId, kind.key));
  const existing = await d
    .select({ id: invoices.id, propertyId: invoices.propertyId })
    .from(invoices)
    .where(inArray(invoices.id, ids));
  if (!existing.length) {
    return;
  }
  const [{ propertyId }] = existing;
  const found = existing.map((row) => row.id);
  const merge = (current: string[]) => [...new Set([...current, ...found])];
  if (tenant.clerkUserId) {
    const rows = await d
      .select({ id: tenantAccess.id, invoiceIds: tenantAccess.invoiceIds })
      .from(tenantAccess)
      .where(
        and(
          eq(tenantAccess.clerkUserId, tenant.clerkUserId),
          eq(tenantAccess.propertyId, propertyId),
          isNull(tenantAccess.revokedAt)
        )
      );
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: At most one row per account and property.
      await d
        .update(tenantAccess)
        .set({ invoiceIds: merge(row.invoiceIds) })
        .where(eq(tenantAccess.id, row.id));
    }
  }
  if (tenant.email) {
    const rows = await d
      .select({
        id: tenantInvitations.id,
        invoiceIds: tenantInvitations.invoiceIds,
      })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.email, tenant.email.trim().toLowerCase()),
          eq(tenantInvitations.propertyId, propertyId),
          eq(tenantInvitations.status, "pending")
        )
      );
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: At most one pending invitation per email and property.
      await d
        .update(tenantInvitations)
        .set({ invoiceIds: merge(row.invoiceIds) })
        .where(eq(tenantInvitations.id, row.id));
    }
  }
}

/**
 * Creates deposit requests for fully signed leases that never got them,
 * such as leases signed before this feature. A deposit the owner removed
 * keeps its record, so it is not created again.
 */
export async function backfillLeaseDeposits() {
  if (!paymentReady()) {
    return 0;
  }
  const d = db();
  const completed = await d
    .select({ id: leasePackets.id })
    .from(leasePackets)
    .where(eq(leasePackets.status, "completed"));
  if (!completed.length) {
    return 0;
  }
  const ids = completed.flatMap((packet) =>
    kinds.map((kind) => depositId(packet.id, kind.key))
  );
  const existing = new Set(
    (
      await d
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.id, ids))
    ).map((row) => row.id)
  );
  let created = 0;
  for (const packet of completed) {
    if (kinds.some((kind) => existing.has(depositId(packet.id, kind.key)))) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: Few leases; keep database load low.
    created += (await createLeaseDeposits(packet.id)).length;
  }
  return created;
}
