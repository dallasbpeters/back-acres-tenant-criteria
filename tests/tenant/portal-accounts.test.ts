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
import {
  GET as listAccess,
  POST as ownerCommand,
} from "../../app/api/admin/tenants/route";
import { db } from "../../lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  leaseTemplates,
  tenantAccess,
} from "../../lib/db/schema";
import {
  pg,
  property,
  propertyId,
  request,
  reset,
  start,
} from "../stripe/harness";

const tell = {
  createdAt: 1_790_000_000_000,
  emailAddresses: [
    {
      emailAddress: "relay@privaterelay.example.invalid",
      id: "email_1",
      verification: { status: "verified" },
    },
  ],
  firstName: "Tell",
  id: "user_tell",
  lastName: "Fuller",
  lastSignInAt: null,
  phoneNumbers: [
    {
      id: "phone_1",
      phoneNumber: "+18065550123",
      verification: { status: "verified" },
    },
  ],
  primaryEmailAddressId: "email_1",
  primaryPhoneNumberId: "phone_1",
  username: null,
};
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ isAuthenticated: false, userId: null })),
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn((id: string) =>
        id === "user_tell"
          ? Promise.resolve(tell)
          : Promise.reject(new Error("not found"))
      ),
      getUserList: vi.fn(() => Promise.resolve({ data: [tell] })),
    },
  })),
}));

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE lease_signers, lease_packets, lease_drafts, lease_templates, tenant_access, resident_links CASCADE"
  );
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  await property();
  const d = db();
  await d.insert(leaseTemplates).values({
    body: "Lease",
    id: "55555555-5555-4555-8555-555555555555",
    name: "Lease",
  });
  await d.insert(leaseDrafts).values({
    body: "Lease",
    id: "66666666-6666-4666-8666-666666666666",
    propertyId,
    templateId: "55555555-5555-4555-8555-555555555555",
    tenantName: "Tell Fuller",
  });
  await d.insert(leasePackets).values({
    basePdf: "",
    body: "Lease",
    brandName: "Back Acres",
    documentHash: "hash",
    draftId: "66666666-6666-4666-8666-666666666666",
    expiresAt: new Date("2099-01-01"),
    familyId: "66666666-6666-4666-8666-666666666666",
    id: "77777777-7777-4777-8777-777777777777",
  });
  await d.insert(leaseSigners).values({
    email: null,
    id: "88888888-8888-4888-8888-888888888888",
    name: "Tell Fuller",
    packetId: "77777777-7777-4777-8777-777777777777",
    phone: "+18065550123",
    role: "tenant",
    tokenHash: "token",
  });
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("portal accounts on Tenant access", () => {
  it("lists accounts made in Clerk before they are connected", async () => {
    const response = await listAccess(
      new NextRequest("https://rental.example.invalid/api/admin/tenants")
    );
    const { accounts } = await response.json();
    expect(accounts).toEqual([
      expect.objectContaining({
        email: "relay@privaterelay.example.invalid",
        id: "user_tell",
        name: "Tell Fuller",
        phone: "+18065550123",
      }),
    ]);
  });
  it("connects an account and attaches its phone lease", async () => {
    const response = await ownerCommand(
      request("/api/admin/tenants", {
        action: "connect",
        clerkUserId: "user_tell",
        propertyId,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ leases: 1, ok: true });
    const [access] = await db().select().from(tenantAccess);
    expect(access).toMatchObject({
      clerkUserId: "user_tell",
      name: "Tell Fuller",
      propertyId,
    });
    const [signer] = await db().select().from(leaseSigners);
    expect(signer.clerkUserId).toBe("user_tell");
  });
  it("refuses an unknown account", async () => {
    const response = await ownerCommand(
      request("/api/admin/tenants", {
        action: "connect",
        clerkUserId: "user_missing",
        propertyId,
      })
    );
    expect(response.status).toBe(404);
  });
});
