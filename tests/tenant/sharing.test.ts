// Register isolated database and owner-session fixtures before importing route code.
import "../stripe/harness";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as ownerCommand } from "../../app/api/admin/tenants/route";
import { db } from "../../lib/db";
import {
  properties,
  residentLinks,
  tenantAccess,
  tenantInvitations,
} from "../../lib/db/schema";
import { claimTenantInvitations } from "../../lib/tenant/invitations";
import {
  invoice,
  id as invoiceId,
  pg,
  propertyId,
  request,
  reset,
  start,
} from "../stripe/harness";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ isAuthenticated: false, userId: null })),
  createClerkClient: vi.fn(() => ({})),
}));

const accessId = "44444444-4444-4444-8444-444444444444";
const invitationId = "77777777-7777-4777-8777-777777777777";
const otherProperty = "99999999-9999-4999-8999-999999999999";

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE tenant_invitations, tenant_access, resident_links CASCADE"
  );
  // invoice() also creates the fixture property.
  await invoice();
  const d = db();
  await d.insert(residentLinks).values({
    expiresAt: new Date("2099-01-01"),
    id: "33333333-3333-4333-8333-333333333333",
    propertyId,
    residentName: "Renter",
  });
  await d.insert(tenantAccess).values({
    clerkUserId: "user_renter",
    id: accessId,
    name: "Renter",
    propertyId,
    residentLinkId: "33333333-3333-4333-8333-333333333333",
  });
  await d.insert(tenantInvitations).values({
    actor: "owner@example.invalid",
    email: "invited@example.invalid",
    id: invitationId,
    name: "Invited",
    propertyId,
  });
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const share = (patch: Record<string, unknown>) =>
  ownerCommand(
    request("/api/admin/tenants", {
      action: "share",
      kind: "invoice",
      recordId: invoiceId,
      shared: true,
      target: { id: accessId, type: "access" },
      ...patch,
    })
  );

describe("assigning payments to renters", () => {
  it("shares and unshares a payment with a connected renter", async () => {
    expect((await share({})).status).toBe(200);
    expect((await share({})).status).toBe(200);
    let [row] = await db().select().from(tenantAccess);
    expect(row.invoiceIds).toEqual([invoiceId]);
    expect((await share({ shared: false })).status).toBe(200);
    [row] = await db().select().from(tenantAccess);
    expect(row.invoiceIds).toEqual([]);
  });
  it("refuses a payment from another property", async () => {
    await db()
      .insert(properties)
      .values({
        data: {
          address: "2 Other St",
          contact: "Owner",
          name: "Other",
        } as never,
        id: otherProperty,
        slug: "other",
      });
    await db().update(tenantAccess).set({ propertyId: otherProperty });
    expect((await share({})).status).toBe(400);
    const [row] = await db().select().from(tenantAccess);
    expect(row.invoiceIds).toEqual([]);
  });
  it("shares with an invited renter and applies it when they sign up", async () => {
    expect(
      (await share({ target: { id: invitationId, type: "invitation" } })).status
    ).toBe(200);
    await claimTenantInvitations("user_invited", ["invited@example.invalid"]);
    const access = await db().select().from(tenantAccess);
    const invited = access.find((a) => a.clerkUserId === "user_invited");
    expect(invited?.invoiceIds).toEqual([invoiceId]);
  });
  it("reports an unknown renter", async () => {
    expect(
      (
        await share({
          target: {
            id: "11111111-2222-4333-8444-555555555555",
            type: "access",
          },
        })
      ).status
    ).toBe(404);
  });
});
