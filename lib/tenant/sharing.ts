import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  invoices,
  managementEvents,
  rentSchedules,
  tenantAccess,
  tenantInvitations,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";

export const shareCommand = z.object({
  action: z.literal("share"),
  /** Share (true) or stop sharing (false). */
  kind: z.enum(["invoice", "schedule"]),
  recordId: z.string().uuid(),
  shared: z.boolean(),
  target: z.object({
    id: z.string().uuid(),
    type: z.enum(["access", "invitation"]),
  }),
});
export type ShareCommand = z.infer<typeof shareCommand>;

const toggle = (ids: string[], id: string, shared: boolean) =>
  shared ? [...new Set([...ids, id])] : ids.filter((value) => value !== id);

/**
 * Shares one payment request or rent schedule with one renter (a connected
 * account, or a pending invitation that applies it on sign-up). The record
 * must belong to the renter's property.
 */
export async function sharePayment(command: ShareCommand, actor: string) {
  const d = db();
  const target =
    command.target.type === "access"
      ? (
          await d
            .select({
              invoiceIds: tenantAccess.invoiceIds,
              propertyId: tenantAccess.propertyId,
              scheduleIds: tenantAccess.scheduleIds,
            })
            .from(tenantAccess)
            .where(eq(tenantAccess.id, command.target.id))
        )[0]
      : (
          await d
            .select({
              invoiceIds: tenantInvitations.invoiceIds,
              propertyId: tenantInvitations.propertyId,
              scheduleIds: tenantInvitations.scheduleIds,
            })
            .from(tenantInvitations)
            .where(
              and(
                eq(tenantInvitations.id, command.target.id),
                eq(tenantInvitations.status, "pending")
              )
            )
        )[0];
  if (!target) {
    return { error: "Renter not found.", status: 404 } as const;
  }
  const table = command.kind === "invoice" ? invoices : rentSchedules;
  const [record] = await d
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.id, command.recordId),
        eq(table.propertyId, target.propertyId),
        notRemoved(table.id)
      )
    );
  if (!record) {
    return {
      error: "That payment belongs to another property or was removed.",
      status: 400,
    } as const;
  }
  const set =
    command.kind === "invoice"
      ? {
          invoiceIds: toggle(
            target.invoiceIds,
            command.recordId,
            command.shared
          ),
        }
      : {
          scheduleIds: toggle(
            target.scheduleIds,
            command.recordId,
            command.shared
          ),
        };
  const update =
    command.target.type === "access"
      ? d
          .update(tenantAccess)
          .set(set)
          .where(eq(tenantAccess.id, command.target.id))
      : d
          .update(tenantInvitations)
          .set(set)
          .where(eq(tenantInvitations.id, command.target.id));
  await d.batch([
    update,
    d.insert(managementEvents).values({
      action: command.shared ? "sharePayment" : "unsharePayment",
      actor,
      detail: {
        kind: command.kind,
        recordId: command.recordId,
        target: command.target.type,
      },
      entityId: command.target.id,
      id: randomUUID(),
    }),
  ]);
  return { ok: true } as const;
}
