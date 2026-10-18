import { randomUUID } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import { db } from "@/lib/db";
import {
  applications,
  invoices,
  leaseDrafts,
  leaseTemplates,
  maintenanceRequests,
  managementEvents,
  noticeVersions,
  properties,
  removedRecords,
  rentSchedules,
  residentLinks,
} from "@/lib/db/schema";
import {
  removalKinds,
  terminalInvoices,
  terminalSchedules,
} from "@/lib/management/removal";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("remove"),
    id: z.string().uuid(),
    kind: z.enum(removalKinds),
  }),
  z.object({ action: z.literal("restore"), id: z.string().uuid() }),
]);
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const parsed = input.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply({ error: "Choose a record to remove or restore." }, 400);
  }
  const c = parsed.data,
    d = db();
  const actor = (await getServerSession(authOptions))?.user?.email ?? "owner";
  try {
    const [removed] = await d
      .select()
      .from(removedRecords)
      .where(eq(removedRecords.entityId, c.id));
    if (c.action === "restore") {
      if (!removed) {
        return reply({ error: "Removed item not found." }, 404);
      }
      await d.batch([
        d
          .delete(removedRecords)
          .where(eq(removedRecords.groupId, removed.groupId)),
        d.insert(managementEvents).values({
          action: "restore",
          actor,
          detail: { kind: removed.kind },
          entityId: c.id,
          id: randomUUID(),
        }),
      ]);
      return reply({ ok: true });
    }
    if (removed) {
      return reply({ ok: true });
    }
    let label = "",
      ids = [c.id];
    if (c.kind === "property") {
      const [row] = await d
        .select()
        .from(properties)
        .where(eq(properties.id, c.id));
      if (!row) {
        return reply({ error: "Property not found." }, 404);
      }
      const active = await d
        .select({ id: rentSchedules.id })
        .from(rentSchedules)
        .where(
          and(
            eq(rentSchedules.propertyId, c.id),
            notInArray(rentSchedules.status, terminalSchedules)
          )
        )
        .limit(1);
      if (active.length) {
        return reply(
          {
            error:
              "Stop this property’s rent schedules in Payments before removing the property.",
          },
          409
        );
      }
      label = row.data.name;
    } else if (c.kind === "leaseDraft") {
      const rows = await d
        .select({
          id: leaseDrafts.id,
          name: leaseDrafts.tenantName,
          parentId: leaseDrafts.parentId,
        })
        .from(leaseDrafts);
      const row = rows.find((r) => r.id === c.id);
      if (!row) {
        return reply({ error: "Lease not found." }, 404);
      }
      label = row.name;
      // Remove the entire connected version family, including branches.
      const family = new Set([c.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const r of rows) {
          if (family.has(r.id) || (r.parentId && family.has(r.parentId))) {
            for (const id of [r.id, r.parentId].filter(
              (idLocal): idLocal is string => !!idLocal
            )) {
              if (!family.has(id)) {
                family.add(id);
                changed = true;
              }
            }
          }
        }
      }
      ids = [...family];
    } else if (c.kind === "notice") {
      const [row] = await d
        .select()
        .from(noticeVersions)
        .where(eq(noticeVersions.documentId, c.id))
        .limit(1);
      if (!row) {
        return reply({ error: "Notice not found." }, 404);
      }
      label = row.notice.applicantName || "Untitled notice";
    } else if (c.kind === "application") {
      const [row] = await d
        .select()
        .from(applications)
        .where(eq(applications.id, c.id));
      if (!row) {
        return reply({ error: "Application not found." }, 404);
      }
      label = row.data.name;
    } else if (c.kind === "leaseTemplate") {
      const [row] = await d
        .select()
        .from(leaseTemplates)
        .where(eq(leaseTemplates.id, c.id));
      if (!row) {
        return reply({ error: "Lease document not found." }, 404);
      }
      label = row.name;
    } else if (c.kind === "invoice") {
      const [row] = await d
        .select()
        .from(invoices)
        .where(eq(invoices.id, c.id));
      if (!row) {
        return reply({ error: "Payment request not found." }, 404);
      }
      if (!terminalInvoices.includes(row.status)) {
        return reply(
          {
            error:
              "Cancel this payment request before removing it. Submitted payments must finish processing first.",
          },
          409
        );
      }
      label = `${row.description} — ${row.payerName}`;
    } else if (c.kind === "rentSchedule") {
      const [row] = await d
        .select()
        .from(rentSchedules)
        .where(eq(rentSchedules.id, c.id));
      if (!row) {
        return reply({ error: "Rent schedule not found." }, 404);
      }
      if (!terminalSchedules.includes(row.status)) {
        return reply(
          { error: "Stop future payments before removing this rent schedule." },
          409
        );
      }
      label = row.payerName;
    } else if (c.kind === "residentLink") {
      const [row] = await d
        .select()
        .from(residentLinks)
        .where(eq(residentLinks.id, c.id));
      if (!row) {
        return reply({ error: "Resident link not found." }, 404);
      }
      label = row.residentName;
    } else {
      const [row] = await d
        .select()
        .from(maintenanceRequests)
        .where(eq(maintenanceRequests.id, c.id));
      if (!row) {
        return reply({ error: "Maintenance request not found." }, 404);
      }
      label = row.data.subject;
    }
    const resolveResult1 = () => {
      if (c.kind === "property") {
        return [
          d
            .update(properties)
            .set({
              data: sql`jsonb_set(jsonb_set(${properties.data}, '{published}', 'false'), '{acceptingApplications}', 'false')`,
              revision: sql`${properties.revision} + 1`,
            })
            .where(eq(properties.id, c.id)),
          d
            .update(residentLinks)
            .set({ revoked: true })
            .where(eq(residentLinks.propertyId, c.id)),
        ];
      }
      if (c.kind === "residentLink") {
        return [
          d
            .update(residentLinks)
            .set({ revoked: true })
            .where(eq(residentLinks.id, c.id)),
        ];
      }
      return [];
    };
    // Batch transactions preserve dependent records, payment history, and delivery evidence.
    await d.batch([
      d
        .insert(removedRecords)
        .values(
          ids.map((entityId) => ({
            actor,
            entityId,
            groupId: c.id,
            kind: c.kind,
            label,
          }))
        )
        .onConflictDoNothing(),
      ...resolveResult1(),
      d.insert(managementEvents).values({
        action: "remove",
        actor,
        detail: { count: ids.length, kind: c.kind },
        entityId: c.id,
        id: randomUUID(),
      }),
    ]);
    return reply({ ok: true });
  } catch {
    return reply(
      { error: "Could not remove this item. Reload and try again." },
      503
    );
  }
}
