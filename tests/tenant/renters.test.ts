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
import { GET } from "../../app/api/admin/renters/route";
import { db } from "../../lib/db";
import {
  leaseDrafts,
  leaseTemplates,
  residentLinks,
  tenantAccess,
  tenantInvitations,
} from "../../lib/db/schema";
import {
  pg,
  property,
  propertyId,
  reset,
  start,
  state,
} from "../stripe/harness";

const clerk = vi.hoisted(() => ({ users: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ isAuthenticated: false, userId: null })),
  createClerkClient: vi.fn(() => ({ users: { getUserList: clerk.users } })),
}));

const draftId = "66666666-6666-4666-8666-666666666666";
const templateId = "55555555-5555-4555-8555-555555555555";
const accountUser = {
  emailAddresses: [
    {
      emailAddress: "Renter@Example.invalid",
      id: "email_1",
      verification: { status: "verified" },
    },
  ],
  id: "user_renter",
  primaryEmailAddressId: "email_1",
};

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE tenant_invitations, tenant_access, resident_links, lease_drafts, lease_templates CASCADE"
  );
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  clerk.users.mockImplementation(
    (query: { emailAddress?: string[]; userId?: string[] }) =>
      Promise.resolve({
        data:
          query.userId?.includes("user_renter") ||
          query.emailAddress?.includes("renter@example.invalid")
            ? [accountUser]
            : [],
      })
  );
  await property();
  const d = db();
  await d
    .insert(leaseTemplates)
    .values({ body: "Lease", id: templateId, name: "Lease" });
  await d.insert(leaseDrafts).values({
    body: "Lease",
    id: draftId,
    propertyId,
    templateId,
    tenantName: "Renter",
  });
  await d.insert(residentLinks).values({
    expiresAt: new Date("2099-01-01"),
    id: "33333333-3333-4333-8333-333333333333",
    propertyId,
    residentName: "Renter",
  });
  await d.insert(tenantAccess).values({
    clerkUserId: "user_renter",
    id: "44444444-4444-4444-8444-444444444444",
    name: "Account Renter",
    propertyId,
    residentLinkId: "33333333-3333-4333-8333-333333333333",
  });
  await d.insert(tenantInvitations).values({
    actor: "owner@example.invalid",
    email: "invited@example.invalid",
    id: "77777777-7777-4777-8777-777777777777",
    name: "Invited Renter",
    propertyId,
  });
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const get = (query: string) =>
  GET(
    new NextRequest(`https://rental.example.invalid/api/admin/renters?${query}`)
  );

describe("connected renters for lease signers", () => {
  it("lists account renters with their portal email and pending invitations", async () => {
    const response = await get(`draftId=${draftId}`);
    expect(response.status).toBe(200);
    expect((await response.json()).renters).toEqual([
      {
        email: "renter@example.invalid",
        name: "Account Renter",
        source: "account",
      },
      {
        email: "invited@example.invalid",
        name: "Invited Renter",
        source: "invited",
      },
    ]);
  });
  it("tells whether a portal account owns an email", async () => {
    expect(await (await get("email=RENTER%40example.invalid")).json()).toEqual({
      hasAccount: true,
      valid: true,
    });
    expect(
      await (await get("email=someone.else%40example.invalid")).json()
    ).toEqual({ hasAccount: false, valid: true });
    expect(await (await get("email=not-an-email")).json()).toEqual({
      hasAccount: false,
      valid: false,
    });
  });
  it("is closed without an owner session", async () => {
    state.session = null;
    expect((await get(`draftId=${draftId}`)).status).toBe(401);
  });
});
