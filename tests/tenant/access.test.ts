// Register isolated database and owner-session fixtures before importing route code.
import "../stripe/harness";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET as ownerRecords } from "../../app/api/admin/management/route";
import { POST as ownerCommand } from "../../app/api/admin/tenants/route";
import { POST as tenantCommand } from "../../app/api/tenant/route";
import { db } from "../../lib/db";
import {
  invoices,
  maintenanceRequests,
  properties,
  residentLinks,
  tenantAccess,
} from "../../lib/db/schema";
import {
  assignment,
  assignments,
  tenantIdentity,
} from "../../lib/tenant/access";
import { verifiedAccountId } from "../../lib/tenant/model";
import {
  id,
  invoice,
  pg,
  property,
  propertyId,
  request,
  reset,
  start,
  state,
} from "../stripe/harness";

const clerk = vi.hoisted(() => ({
  userId: "user_tenant_a" as string | null,
  users: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      isAuthenticated: Boolean(clerk.userId),
      userId: clerk.userId,
    })
  ),
  createClerkClient: vi.fn(() => ({ users: { getUserList: clerk.users } })),
}));
const verifiedUser = {
  emailAddresses: [
    {
      emailAddress: "tenant@example.invalid",
      verification: { status: "verified" },
    },
  ],
  id: "user_tenant_a",
};
const linkId = "33333333-3333-4333-8333-333333333333";
const accessId = "44444444-4444-4444-8444-444444444444";
beforeAll(start);
beforeEach(async () => {
  await reset();
  clerk.userId = "user_tenant_a";
  clerk.users.mockResolvedValue({ data: [verifiedUser] });
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function grant() {
  await property();
  await db()
    .insert(residentLinks)
    .values({
      expiresAt: new Date("2099-01-01"),
      id: linkId,
      propertyId,
      residentName: "Tenant A",
    });
  await db().insert(tenantAccess).values({
    clerkUserId: "user_tenant_a",
    id: accessId,
    name: "Tenant A",
    propertyId,
    residentLinkId: linkId,
  });
}
const settings = (patch = {}) =>
  tenantCommand(
    request("/api/tenant", {
      action: "settings",
      id: accessId,
      phone: "555-0100",
      ...patch,
    })
  );
const assign = (patch = {}) =>
  ownerCommand(
    request("/api/admin/tenants", {
      action: "assign",
      data: {
        email: "tenant@example.invalid",
        invoiceIds: [],
        name: "Tenant A",
        propertyId,
        scheduleIds: [],
        ...patch,
      },
    })
  );
describe("Clerk identity and tenancy boundaries", () => {
  it("lets a connected tenant request maintenance without an owner-made link", async () => {
    await property();
    expect((await assign()).status).toBe(200);
    const [access] = await assignments("user_tenant_a");
    const submitted = await tenantCommand(
      request("/api/tenant", {
        action: "maintenance",
        data: {
          accessNotes: "",
          description: "Fixture leak under sink",
          email: "tenant@example.invalid",
          name: "Tenant A",
          phone: "555-0100",
          priority: "routine",
          subject: "Fixture sink",
        },
        id: access.id,
      })
    );
    expect(submitted.status).toBe(201);
    const records = await (
      await ownerRecords(
        new NextRequest("https://rental.example.invalid/api/admin/management")
      )
    ).json();
    expect(
      records.maintenance.map(
        (m: { data: { subject: string } }) => m.data.subject
      )
    ).toContain("Fixture sink");
    // The tenant's internal maintenance identity is not an owner request link.
    expect(
      records.residentLinks.map((l: { id: string }) => l.id)
    ).not.toContain(access.residentLinkId);
  });

  it("requires an active Clerk session and fails closed without keys", async () => {
    clerk.userId = null;
    expect(await tenantIdentity()).toBeNull();
    expect((await settings()).status).toBe(401);
    clerk.userId = "user_tenant_a";
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await tenantIdentity()).toBeNull();
  });
  it("does not expose another account's tenancy", async () => {
    await grant();
    expect(await assignments("user_tenant_b")).toEqual([]);
    expect(await assignment("user_tenant_b", accessId)).toBeNull();
    clerk.userId = "user_tenant_b";
    expect((await settings()).status).toBe(404);
  });
  it("updates contact details only for the signed-in tenancy", async () => {
    await grant();
    expect((await settings()).status).toBe(200);
    expect((await assignment("user_tenant_a", accessId))?.phone).toBe(
      "555-0100"
    );
  });
  it("denies cross-origin mutations before reading tenancy records", async () => {
    expect(
      (
        await tenantCommand(
          request("/api/tenant", {}, { origin: "https://evil.invalid" })
        )
      ).status
    ).toBe(403);
  });
  it("hides all tenancies of a removed property", async () => {
    await grant();
    await pg.exec(
      `INSERT INTO removed_records (entity_id, group_id, kind, label, actor) VALUES ('${propertyId}','${propertyId}','property','Fixture','owner')`
    );
    expect(await assignments("user_tenant_a")).toEqual([]);
    expect((await settings()).status).toBe(404);
  });
  it("does not treat an owner session as a Clerk tenant session", async () => {
    clerk.userId = null;
    expect(state.session).not.toBeNull();
    expect((await settings()).status).toBe(401);
  });
  it("requires existing verified email ownership for owner assignment", async () => {
    await property();
    clerk.users.mockResolvedValue({
      data: [
        {
          ...verifiedUser,
          emailAddresses: [
            {
              emailAddress: "tenant@example.invalid",
              verification: { status: "unverified" },
            },
          ],
        },
      ],
    });
    expect((await assign()).status).toBe(409);
    expect(await db().select().from(tenantAccess)).toEqual([]);
  });
  it("rejects ambiguous or mismatched account emails", () => {
    expect(
      verifiedAccountId([verifiedUser], "other@example.invalid")
    ).toBeNull();
    expect(
      verifiedAccountId(
        [verifiedUser, { ...verifiedUser, id: "duplicate" }],
        "tenant@example.invalid"
      )
    ).toBeNull();
    expect(verifiedAccountId([verifiedUser], " TENANT@example.invalid ")).toBe(
      "user_tenant_a"
    );
  });
  it("creates an explicit grant and never automatically shares every payment", async () => {
    await invoice();
    expect((await assign()).status).toBe(200);
    const [access] = await assignments("user_tenant_a");
    expect(access.invoiceIds).toEqual([]);
    expect(access.clerkUserId).toBe("user_tenant_a");
    expect((await assign({ invoiceIds: [id] })).status).toBe(200);
    expect((await assignments("user_tenant_a"))[0].invoiceIds).toEqual([id]);
  });
  it("requires owner authentication even with a valid tenant session", async () => {
    state.session = null;
    expect((await assign()).status).toBe(401);
  });
  it("rejects an invoice from another property", async () => {
    await invoice();
    const otherId = "55555555-5555-4555-8555-555555555555";
    await db()
      .insert(properties)
      .values({
        data: (await db().select().from(properties))[0].data,
        id: otherId,
        slug: "other",
      });
    expect(
      (await assign({ invoiceIds: [id], propertyId: otherId })).status
    ).toBe(400);
    expect(await db().select().from(tenantAccess)).toEqual([]);
    expect(await db().select().from(invoices)).toHaveLength(1);
  });
  it("revokes access and preserves maintenance history", async () => {
    await grant();
    const response = await ownerCommand(
      request("/api/admin/tenants", { action: "revoke", id: accessId })
    );
    expect(response.status).toBe(200);
    expect(await assignments("user_tenant_a")).toEqual([]);
    expect((await settings()).status).toBe(404);
    expect(await db().select().from(residentLinks)).toHaveLength(1);
  });
  it("stores maintenance under the authorized property, ignoring forged property fields", async () => {
    await grant();
    const response = await tenantCommand(
      request("/api/tenant", {
        action: "maintenance",
        data: {
          accessNotes: "Call first",
          description: "Kitchen faucet leaks",
          email: "tenant@example.invalid",
          name: "Tenant A",
          phone: "555-0100",
          priority: "routine",
          subject: "Leak",
        },
        id: accessId,
        propertyId: id,
      })
    );
    expect(response.status).toBe(201);
    const [row] = await db().select().from(maintenanceRequests);
    expect(row.propertyId).toBe(propertyId);
    expect(row.residentLinkId).toBe(linkId);
  });
  it("validates settings and returns a recoverable error on provider outage", async () => {
    expect((await settings({ phone: "x".repeat(51) })).status).toBe(400);
    await property();
    clerk.users.mockRejectedValue(new Error("Provider unavailable"));
    expect((await assign()).status).toBe(503);
  });
});
