const pattern1 = /^(sk|rk)_live_/;

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, notExists } from "drizzle-orm";
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
  listingPhotos,
  listingPublications,
  maintenanceRequests,
  managementEvents,
  properties,
  removedRecords,
  rentSchedules,
  residentLinks,
  tenantAccess,
} from "@/lib/db/schema";
import { disclosureFields } from "@/lib/leases/disclosures";
import { documentText, leaseDocumentSchema } from "@/lib/leases/document";
import { leaseFields } from "@/lib/management/leases";
import { listingDigest } from "@/lib/management/listing-digest";
import {
  applicationStatuses,
  invoiceSchema,
  maintenanceStatuses,
  propertySchema,
} from "@/lib/management/model";
import { notRemoved } from "@/lib/management/not-removed";
import { linkToken, siteUrl } from "@/lib/management/security";
import { paymentMode, paymentReady, stripe } from "@/lib/management/stripe";

const uuid = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("leaseDefaults"),
    propertyId: uuid,
    values: z
      .record(z.string(), z.string().max(3000))
      .refine((v) =>
        Object.keys(v).every((k) =>
          disclosureFields.includes(k as (typeof disclosureFields)[number])
        )
      ),
  }),
  z.object({
    action: z.literal("leaseTemplate"),
    body: z.string().trim().min(1).max(45_000),
    id: uuid,
    name: z.string().trim().min(1).max(300),
  }),
  z.object({
    action: z.literal("leaseDraft"),
    body: z.string().trim().min(1).max(45_000),
    document: leaseDocumentSchema.optional(),
    id: uuid,
    parentId: uuid.nullable(),
    propertyId: uuid,
    templateId: uuid,
    tenantName: z.string().trim().min(1).max(300),
    values: z
      .record(z.string(), z.string().max(3000))
      .refine((v) =>
        Object.keys(v).every((k) =>
          leaseFields.includes(k as (typeof leaseFields)[number])
        )
      )
      .optional(),
  }),
  z.object({
    action: z.literal("property"),
    data: propertySchema,
    id: uuid,
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("applicationStatus"),
    id: uuid,
    status: z.enum(applicationStatuses),
  }),
  z.object({
    action: z.literal("maintenanceStatus"),
    id: uuid,
    status: z.enum(maintenanceStatuses),
  }),
  z.object({
    action: z.literal("residentLink"),
    propertyId: uuid,
    residentName: z.string().trim().min(1).max(300),
  }),
  z.object({ action: z.literal("revokeLink"), id: uuid }),
  z.object({ action: z.literal("voidInvoice"), id: uuid }),
  z.object({ action: z.literal("invoice"), data: invoiceSchema, id: uuid }),
]);
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    const d = db();
    const removedGroups = d
      .selectDistinctOn([removedRecords.groupId])
      .from(removedRecords)
      .orderBy(removedRecords.groupId)
      .as("removed_groups");
    const [
      propertyRows,
      applicationRows,
      maintenanceRows,
      links,
      invoiceRows,
      templates,
      drafts,
      schedules,
      photos,
      publications,
      removed,
    ] = await Promise.all([
      d
        .select()
        .from(properties)
        .where(notRemoved(properties.id))
        .orderBy(desc(properties.createdAt))
        .limit(200),
      d
        .select()
        .from(applications)
        .where(notRemoved(applications.id))
        .orderBy(desc(applications.createdAt))
        .limit(200),
      d
        .select()
        .from(maintenanceRequests)
        .where(notRemoved(maintenanceRequests.id))
        .orderBy(desc(maintenanceRequests.createdAt))
        .limit(200),
      d
        .select()
        .from(residentLinks)
        .where(
          and(
            notRemoved(residentLinks.id),
            // Tenant accounts carry an internal maintenance identity; only
            // links the owner created by hand belong in this list.
            notExists(
              d
                .select({ id: tenantAccess.id })
                .from(tenantAccess)
                .where(eq(tenantAccess.residentLinkId, residentLinks.id))
            )
          )
        )
        .orderBy(desc(residentLinks.createdAt))
        .limit(200),
      d
        .select()
        .from(invoices)
        .where(notRemoved(invoices.id))
        .orderBy(desc(invoices.createdAt))
        .limit(200),
      d
        .select()
        .from(leaseTemplates)
        .where(notRemoved(leaseTemplates.id))
        .orderBy(desc(leaseTemplates.createdAt))
        .limit(50),
      d
        .select()
        .from(leaseDrafts)
        // Leases stay listed even when their property is removed; sending
        // explains how to restore the property first.
        .where(notRemoved(leaseDrafts.id))
        .orderBy(desc(leaseDrafts.createdAt))
        .limit(200),
      d
        .select()
        .from(rentSchedules)
        .where(notRemoved(rentSchedules.id))
        .orderBy(desc(rentSchedules.createdAt))
        .limit(200),
      d
        .select()
        .from(listingPhotos)
        .orderBy(listingPhotos.position, listingPhotos.createdAt),
      d.select().from(listingPublications),
      d
        .select()
        .from(removedGroups)
        .orderBy(desc(removedGroups.removedAt))
        .limit(500),
    ]);
    return reply({
      applications: applicationRows,
      drafts,
      invoices: invoiceRows.map((r) => ({
        ...r,
        url: `${siteUrl()}/pay/${linkToken("payment", r.id)}`,
      })),
      maintenance: maintenanceRows,
      paymentMode: pattern1.test(process.env.STRIPE_SECRET_KEY ?? "")
        ? "live"
        : "test",
      paymentsReady: paymentReady(),
      photos: photos.map(({ blobPath, ...photo }) => ({
        ...photo,
        url: `/api/photos/${photo.id}`,
      })),
      properties: propertyRows.map((p) => ({
        ...p,
        publishingDigest: listingDigest(
          p.data,
          photos
            .filter((photo) => photo.propertyId === p.id && !photo.archived)
            .map(({ id, caption }) => ({ caption, id }))
        ),
      })),
      publications,
      removed,
      rentSchedules: schedules.map((r) => ({
        ...r,
        enrollmentUrl:
          r.collection === "ach"
            ? `${siteUrl()}/autopay/${linkToken("autopay", r.id)}`
            : null,
      })),
      residentLinks: links.map((r) => ({
        ...r,
        url: `${siteUrl()}/maintenance/${linkToken("maintenance", r.id)}`,
      })),
      templates,
    });
  } catch {
    return reply({ error: "Could not load property records." }, 503);
  }
}
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const parsed = command.safeParse(
    await readBody(request, 256_000).catch(() => null)
  );
  if (!parsed.success) {
    return reply({ error: "Check the required fields and amounts." }, 400);
  }
  const c = parsed.data;
  const d = db();
  const actor = (await getServerSession(authOptions))?.user?.email ?? "owner";
  const event = (id: string, detail: unknown) =>
    d.insert(managementEvents).values({
      action: c.action,
      actor,
      detail,
      entityId: id,
      id: randomUUID(),
    });
  try {
    const resolveResult1 = () => {
      if ("propertyId" in c) {
        return c.propertyId;
      }
      if (c.action === "invoice") {
        return c.data.propertyId;
      }
      return null;
    };
    const referencedIds = [
      "id" in c ? c.id : null,
      resolveResult1(),
      "templateId" in c ? c.templateId : null,
      "parentId" in c ? c.parentId : null,
    ].filter((id): id is string => !!id);
    if (referencedIds.length) {
      const removed = await d
        .select({ id: removedRecords.entityId })
        .from(removedRecords)
        .where(inArray(removedRecords.entityId, referencedIds))
        .limit(1);
      if (removed.length) {
        return reply(
          {
            error:
              "This item or its property/document was removed. Restore it in Removed items before making changes.",
          },
          409
        );
      }
    }
    if (c.action === "leaseTemplate") {
      await d
        .insert(leaseTemplates)
        .values({ body: c.body, id: c.id, name: c.name })
        .onConflictDoNothing();
    } else if (c.action === "leaseDefaults") {
      const [updated] = await d
        .update(properties)
        .set({ leaseDefaults: c.values })
        .where(and(eq(properties.id, c.propertyId), notRemoved(properties.id)))
        .returning({ id: properties.id });
      if (!updated) {
        return reply({ error: "Property not found." }, 404);
      }
      await event(c.propertyId, { fields: Object.keys(c.values) });
    } else if (c.action === "leaseDraft") {
      if (c.document && documentText(c.document).trim() !== c.body.trim()) {
        return reply(
          {
            error:
              "The editor text and saved document do not match. Reload the draft and try again.",
          },
          400
        );
      }
      if (c.parentId) {
        const [parent] = await d
          .select()
          .from(leaseDrafts)
          .where(eq(leaseDrafts.id, c.parentId));
        if (
          !parent ||
          parent.propertyId !== c.propertyId ||
          parent.templateId !== c.templateId
        ) {
          return reply({ error: "Invalid prior lease version." }, 400);
        }
      }
      await d
        .insert(leaseDrafts)
        .values({
          body: c.body,
          document: c.document ?? null,
          id: c.id,
          parentId: c.parentId,
          propertyId: c.propertyId,
          templateId: c.templateId,
          tenantName: c.tenantName,
          values: c.values ?? null,
        })
        .onConflictDoNothing();
    } else if (c.action === "property") {
      if (c.revision === 0) {
        let saved: typeof properties.$inferSelect | undefined;
        for (const slug of [
          c.data.slug,
          `${c.data.slug}-${c.id.replaceAll("-", "")}`,
        ]) {
          [saved] =
            /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await d
              .insert(properties)
              .values({ data: { ...c.data, slug }, id: c.id, slug })
              .onConflictDoNothing()
              .returning();
          if (saved) {
            break;
          }
        }
        if (!saved) {
          return reply(
            {
              error:
                "This property was already saved. Reload to see its listing link.",
            },
            409
          );
        }
        await event(c.id, saved.data);
      } else {
        const [existing] = await d
          .select()
          .from(properties)
          .where(eq(properties.id, c.id));
        if (!existing) {
          return reply({ error: "Property not found." }, 404);
        }
        // Keep shared listing and application links working after address corrections.
        const data = { ...c.data, slug: existing.slug };
        const [result] = await d
          .update(properties)
          .set({ data, revision: c.revision + 1 })
          .where(
            and(eq(properties.id, c.id), eq(properties.revision, c.revision))
          )
          .returning();
        if (!result) {
          return reply(
            {
              error:
                "This property changed in another window. Reload before saving.",
            },
            409
          );
        }
        await event(c.id, data);
      }
    } else if (
      c.action === "applicationStatus" ||
      c.action === "maintenanceStatus"
    ) {
      const table =
        c.action === "applicationStatus" ? applications : maintenanceRequests;
      const [existing] = await d
        .select({ id: table.id })
        .from(table)
        .where(eq(table.id, c.id));
      if (!existing) {
        return reply({ error: "Record not found." }, 404);
      }
      await d.batch([
        d.update(table).set({ status: c.status }).where(eq(table.id, c.id)),
        event(c.id, { status: c.status }),
      ]);
    } else if (c.action === "residentLink") {
      const id = randomUUID();
      await d.batch([
        d.insert(residentLinks).values({
          expiresAt: new Date(Date.now() + 365 * 86_400_000),
          id,
          propertyId: c.propertyId,
          residentName: c.residentName,
        }),
        event(id, { propertyId: c.propertyId, residentName: c.residentName }),
      ]);
    } else if (c.action === "revokeLink") {
      await d.batch([
        d
          .update(residentLinks)
          .set({ revoked: true })
          .where(eq(residentLinks.id, c.id)),
        event(c.id, { revoked: true }),
      ]);
    } else if (c.action === "voidInvoice") {
      const [invoice] = await d
        .select()
        .from(invoices)
        .where(eq(invoices.id, c.id));
      if (!invoice) {
        return reply({ error: "Payment request not found." }, 404);
      }
      if (invoice.mode !== paymentMode()) {
        return reply(
          { error: "This request belongs to another payment environment." },
          409
        );
      }
      if (invoice.status === "void") {
        return reply({ ok: true });
      }
      if (invoice.status !== "open") {
        return reply(
          {
            error:
              "Payment has been submitted or checkout needs reconciliation. Review it in Stripe before canceling.",
          },
          409
        );
      }
      if (invoice.stripeInvoiceId) {
        await stripe().invoices.voidInvoice(invoice.stripeInvoiceId);
      }
      if (invoice.stripeSessionId) {
        const session = await stripe().checkout.sessions.retrieve(
          invoice.stripeSessionId
        );
        if (session.status === "complete") {
          return reply(
            {
              error:
                "Checkout was submitted. Wait for confirmation before making changes.",
            },
            409
          );
        }
        if (session.status === "open") {
          await stripe().checkout.sessions.expire(session.id);
        }
      }
      const [changed] = await d
        .update(invoices)
        .set({ status: "void" })
        .where(
          and(
            eq(invoices.id, c.id),
            eq(invoices.status, "open"),
            invoice.stripeSessionId
              ? eq(invoices.stripeSessionId, invoice.stripeSessionId)
              : isNull(invoices.stripeSessionId)
          )
        )
        .returning();
      if (!changed) {
        return reply(
          {
            error:
              "Checkout started while canceling. Review the payment before retrying.",
          },
          409
        );
      }
      await event(c.id, { status: "void" });
    } else if (c.action === "invoice") {
      const [existing] = await d
        .select()
        .from(invoices)
        .where(eq(invoices.id, c.id));
      if (existing) {
        return reply({ ok: true });
      }
      await d.batch([
        d.insert(invoices).values({ id: c.id, ...c.data, mode: paymentMode() }),
        event(c.id, {
          amountCents: c.data.amountCents,
          category: c.data.category,
        }),
      ]);
    }
    return reply({ ok: true });
  } catch {
    return reply(
      {
        error:
          "Could not save. Check for a duplicate property URL or reload and try again.",
      },
      409
    );
  }
}
