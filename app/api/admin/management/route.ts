import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  properties,
  applications,
  maintenanceRequests,
  residentLinks,
  invoices,
  managementEvents,
  leaseTemplates,
  leaseDrafts,
  rentSchedules,
  listingPhotos,
  listingPublications,
} from "@/lib/db/schema";
import { listingDigest } from "@/lib/management/listing-digest";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import {
  propertySchema,
  invoiceSchema,
  applicationStatuses,
  maintenanceStatuses,
} from "@/lib/management/model";
import { linkToken, siteUrl } from "@/lib/management/security";
import { paymentReady, paymentMode, stripe } from "@/lib/management/stripe";
const uuid = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("leaseTemplate"),
    id: uuid,
    name: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(45000),
  }),
  z.object({
    action: z.literal("leaseDraft"),
    id: uuid,
    propertyId: uuid,
    templateId: uuid,
    parentId: uuid.nullable(),
    tenantName: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(45000),
  }),
  z.object({
    action: z.literal("property"),
    id: uuid,
    revision: z.number().int().nonnegative(),
    data: propertySchema,
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
  z.object({ action: z.literal("invoice"), id: uuid, data: invoiceSchema }),
]);
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const d = db();
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
    ] = await Promise.all([
      d
        .select()
        .from(properties)
        .orderBy(desc(properties.createdAt))
        .limit(200),
      d
        .select()
        .from(applications)
        .orderBy(desc(applications.createdAt))
        .limit(200),
      d
        .select()
        .from(maintenanceRequests)
        .orderBy(desc(maintenanceRequests.createdAt))
        .limit(200),
      d
        .select()
        .from(residentLinks)
        .orderBy(desc(residentLinks.createdAt))
        .limit(200),
      d.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(200),
      d
        .select()
        .from(leaseTemplates)
        .orderBy(desc(leaseTemplates.createdAt))
        .limit(50),
      d
        .select()
        .from(leaseDrafts)
        .orderBy(desc(leaseDrafts.createdAt))
        .limit(200),
      d
        .select()
        .from(rentSchedules)
        .orderBy(desc(rentSchedules.createdAt))
        .limit(200),
      d
        .select()
        .from(listingPhotos)
        .orderBy(listingPhotos.position, listingPhotos.createdAt),
      d.select().from(listingPublications),
    ]);
    return reply({
      photos: photos.map(({ blobPath, ...photo }) => ({
        ...photo,
        url: `/api/photos/${photo.id}`,
      })),
      publications,
      properties: propertyRows.map((p) => ({
        ...p,
        publishingDigest: listingDigest(
          p.data,
          photos
            .filter((photo) => photo.propertyId === p.id && !photo.archived)
            .map(({ id, caption }) => ({ id, caption })),
        ),
      })),
      applications: applicationRows,
      maintenance: maintenanceRows,
      residentLinks: links.map((r) => ({
        ...r,
        url: `${siteUrl()}/maintenance/${linkToken("maintenance", r.id)}`,
      })),
      invoices: invoiceRows.map((r) => ({
        ...r,
        url: `${siteUrl()}/pay/${linkToken("payment", r.id)}`,
      })),
      templates,
      drafts,
      rentSchedules: schedules.map((r) => ({
        ...r,
        enrollmentUrl:
          r.collection === "ach"
            ? `${siteUrl()}/autopay/${linkToken("autopay", r.id)}`
            : null,
      })),
      paymentsReady: paymentReady(),
      paymentMode: /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")
        ? "live"
        : "test",
    });
  } catch {
    return reply({ error: "Could not load property records." }, 503);
  }
}
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = command.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply({ error: "Check the required fields and amounts." }, 400);
  const c = parsed.data;
  const d = db();
  const actor = (await getServerSession(authOptions))?.user?.email ?? "owner";
  const event = (id: string, detail: unknown) =>
    d.insert(managementEvents).values({
      id: randomUUID(),
      entityId: id,
      actor,
      action: c.action,
      detail,
    });
  try {
    if (c.action === "leaseTemplate") {
      await d
        .insert(leaseTemplates)
        .values({ id: c.id, name: c.name, body: c.body })
        .onConflictDoNothing();
    } else if (c.action === "leaseDraft") {
      if (c.parentId) {
        const [parent] = await d
          .select()
          .from(leaseDrafts)
          .where(eq(leaseDrafts.id, c.parentId));
        if (
          !parent ||
          parent.propertyId !== c.propertyId ||
          parent.templateId !== c.templateId
        )
          return reply({ error: "Invalid prior lease version." }, 400);
      }
      await d
        .insert(leaseDrafts)
        .values({
          id: c.id,
          propertyId: c.propertyId,
          templateId: c.templateId,
          parentId: c.parentId,
          tenantName: c.tenantName,
          body: c.body,
        })
        .onConflictDoNothing();
    } else if (c.action === "property") {
      if (c.revision === 0) {
        let saved;
        for (const slug of [
          c.data.slug,
          `${c.data.slug}-${c.id.replaceAll("-", "")}`,
        ]) {
          [saved] = await d
            .insert(properties)
            .values({ id: c.id, slug, data: { ...c.data, slug } })
            .onConflictDoNothing()
            .returning();
          if (saved) break;
        }
        if (!saved)
          return reply(
            {
              error:
                "This property was already saved. Reload to see its listing link.",
            },
            409,
          );
        await event(c.id, saved.data);
      } else {
        const [existing] = await d
          .select()
          .from(properties)
          .where(eq(properties.id, c.id));
        if (!existing) return reply({ error: "Property not found." }, 404);
        // Keep shared listing and application links working after address corrections.
        const data = { ...c.data, slug: existing.slug };
        const [result] = await d
          .update(properties)
          .set({ data, revision: c.revision + 1 })
          .where(
            and(eq(properties.id, c.id), eq(properties.revision, c.revision)),
          )
          .returning();
        if (!result)
          return reply(
            {
              error:
                "This property changed in another window. Reload before saving.",
            },
            409,
          );
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
      if (!existing) return reply({ error: "Record not found." }, 404);
      await d.batch([
        d.update(table).set({ status: c.status }).where(eq(table.id, c.id)),
        event(c.id, { status: c.status }),
      ]);
    } else if (c.action === "residentLink") {
      const id = randomUUID();
      await d.batch([
        d.insert(residentLinks).values({
          id,
          propertyId: c.propertyId,
          residentName: c.residentName,
          expiresAt: new Date(Date.now() + 365 * 86400000),
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
      if (!invoice) return reply({ error: "Payment request not found." }, 404);
      if (invoice.status === "void") return reply({ ok: true });
      if (invoice.status !== "open")
        return reply(
          {
            error:
              "Payment has been submitted or checkout needs reconciliation. Review it in Stripe before canceling.",
          },
          409,
        );
      if (invoice.stripeInvoiceId) {
        await stripe().invoices.voidInvoice(invoice.stripeInvoiceId);
      }
      if (invoice.stripeSessionId) {
        const session = await stripe().checkout.sessions.retrieve(
          invoice.stripeSessionId,
        );
        if (session.status === "complete")
          return reply(
            {
              error:
                "Checkout was submitted. Wait for confirmation before making changes.",
            },
            409,
          );
        if (session.status === "open")
          await stripe().checkout.sessions.expire(session.id);
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
              : isNull(invoices.stripeSessionId),
          ),
        )
        .returning();
      if (!changed)
        return reply(
          {
            error:
              "Checkout started while canceling. Review the payment before retrying.",
          },
          409,
        );
      await event(c.id, { status: "void" });
    } else if (c.action === "invoice") {
      const [existing] = await d
        .select()
        .from(invoices)
        .where(eq(invoices.id, c.id));
      if (existing) return reply({ ok: true });
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
      409,
    );
  }
}
