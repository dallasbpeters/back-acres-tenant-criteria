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
import { tenantAccess, tenantInvitations } from "../../lib/db/schema";
import {
  claimTenantInvitations,
  preparePortalForLeaseTenant,
} from "../../lib/tenant/invitations";
import {
  invoice,
  id as invoiceId,
  pg,
  propertyId,
  request,
  reset,
  start,
} from "../stripe/harness";

const clerk = vi.hoisted(() => ({
  invite: vi.fn(),
  list: vi.fn(),
  mail: vi.fn(),
  revoke: vi.fn(),
  users: vi.fn(),
}));
vi.mock("@/lib/leases/mail", () => ({ sendLeaseMail: clerk.mail }));
vi.mock("@/lib/email-brand", () => ({
  currentEmailBrand: () =>
    Promise.resolve({ logoUrl: null, name: "Saved Brand" }),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ isAuthenticated: false, userId: null })),
  createClerkClient: vi.fn(() => ({
    invitations: {
      createInvitation: clerk.invite,
      getInvitationList: clerk.list,
      revokeInvitation: clerk.revoke,
    },
    users: { getUserList: clerk.users },
  })),
}));

beforeAll(start);
beforeEach(async () => {
  await reset();
  clerk.users.mockResolvedValue({ data: [] });
  let count = 0;
  clerk.invite.mockImplementation(() => {
    count += 1;
    return Promise.resolve({
      id: `inv_${count}`,
      url: `https://clerk.example.invalid/accept?ticket=${count}`,
    });
  });
  clerk.mail.mockResolvedValue(new Response("{}", { status: 200 }));
  clerk.revoke.mockResolvedValue({});
  clerk.list.mockResolvedValue({
    data: [
      { emailAddress: "new.tenant@example.invalid", id: "inv_1" },
      { emailAddress: "new.tenant@example.invalid", id: "inv_2" },
      { emailAddress: "someone.else@example.invalid", id: "inv_other" },
    ],
  });
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  // invoice() also creates the fixture property.
  await invoice();
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const invite = (patch = {}) =>
  ownerCommand(
    request("/api/admin/tenants", {
      action: "assign",
      data: {
        email: "New.Tenant@example.invalid",
        invoiceIds: [invoiceId],
        name: "New Tenant",
        propertyId,
        scheduleIds: [],
        ...patch,
      },
    })
  );
const pending = () => db().select().from(tenantInvitations);

describe("tenant invitations", () => {
  it("emails a Clerk invitation and keeps the grant pending", async () => {
    const response = await invite();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invited: true });
    expect(clerk.invite).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "new.tenant@example.invalid",
        notify: false,
        redirectUrl: "https://rental.example.invalid/sign-up",
      })
    );
    expect(clerk.mail).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: { logoUrl: null, name: "Saved Brand" },
        subject: "Saved Brand: your tenant portal invitation",
        text: expect.stringContaining(
          "https://clerk.example.invalid/accept?ticket=1"
        ),
        to: "new.tenant@example.invalid",
      })
    );
    const [row] = await pending();
    expect(row).toMatchObject({
      actor: "owner@example.invalid",
      clerkInvitationId: "inv_1",
      email: "new.tenant@example.invalid",
      invoiceIds: [invoiceId],
      propertyId,
      status: "pending",
    });
    expect(await db().select().from(tenantAccess)).toEqual([]);
  });
  it("explains when the Clerk instance does not accept email addresses", async () => {
    clerk.invite.mockRejectedValueOnce({
      errors: [{ code: "invitations_not_supported", message: "Not supported" }],
    });
    const response = await invite();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("turn on Email address");
    expect(await pending()).toEqual([]);
  });
  it("revokes the Clerk invitation when our email is not accepted", async () => {
    clerk.mail.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    expect((await invite()).status).toBe(503);
    expect(clerk.revoke).toHaveBeenCalledWith("inv_1");
    expect(await pending()).toEqual([]);
  });
  it("updates one pending invitation when the owner invites again", async () => {
    await invite();
    await invite({ invoiceIds: [], name: "Renamed Tenant" });
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clerkInvitationId: "inv_2",
      invoiceIds: [],
      name: "Renamed Tenant",
    });
  });
  it("grants access once the invited email is verified and signs in", async () => {
    await invite();
    expect(
      await claimTenantInvitations("user_other", ["other@example.invalid"])
    ).toBe(0);
    expect(
      await claimTenantInvitations("user_new", ["new.tenant@example.invalid"])
    ).toBe(1);
    const [access] = await db().select().from(tenantAccess);
    expect(access).toMatchObject({
      clerkUserId: "user_new",
      invoiceIds: [invoiceId],
      name: "New Tenant",
      propertyId,
      revokedAt: null,
    });
    const [row] = await pending();
    expect(row).toMatchObject({
      status: "accepted",
      tenantAccessId: access.id,
    });
    expect(
      await claimTenantInvitations("user_new", ["new.tenant@example.invalid"])
    ).toBe(0);
  });
  it("lets the owner resend or cancel a pending invitation", async () => {
    await invite();
    const [row] = await pending();
    const resend = await ownerCommand(
      request("/api/admin/tenants", { action: "resendInvite", id: row.id })
    );
    expect(resend.status).toBe(200);
    // Earlier invitation emails keep working after a resend.
    expect(clerk.revoke).not.toHaveBeenCalled();
    expect((await pending())[0].clerkInvitationId).toBe("inv_2");
    const cancel = await ownerCommand(
      request("/api/admin/tenants", { action: "cancelInvite", id: row.id })
    );
    expect(cancel.status).toBe(200);
    expect((await pending())[0].status).toBe("canceled");
    // Canceling revokes every link sent to that email, and only those.
    expect(clerk.revoke.mock.calls.map(([id]) => id).sort()).toEqual([
      "inv_1",
      "inv_2",
    ]);
    expect(
      await claimTenantInvitations("user_new", ["new.tenant@example.invalid"])
    ).toBe(0);
    expect(
      (
        await ownerCommand(
          request("/api/admin/tenants", { action: "cancelInvite", id: row.id })
        )
      ).status
    ).toBe(404);
  });
  it("sets up portal access for a lease tenant without an account", async () => {
    const url = await preparePortalForLeaseTenant({
      actor: "owner@example.invalid",
      email: "New.Tenant@example.invalid",
      name: "New Tenant",
      propertyId,
    });
    expect(url).toBe("https://clerk.example.invalid/accept?ticket=1");
    expect(clerk.mail).not.toHaveBeenCalled();
    const [row] = await pending();
    expect(row).toMatchObject({
      email: "new.tenant@example.invalid",
      invoiceIds: [],
      propertyId,
      status: "pending",
    });
    await preparePortalForLeaseTenant({
      actor: "owner@example.invalid",
      email: "new.tenant@example.invalid",
      name: "New Tenant",
      propertyId,
    });
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0].clerkInvitationId).toBe("inv_2");
  });
  it("grants a verified lease tenant access without replacing shared records", async () => {
    clerk.users.mockResolvedValue({
      data: [
        {
          emailAddresses: [
            {
              emailAddress: "new.tenant@example.invalid",
              verification: { status: "verified" },
            },
          ],
          id: "user_new",
        },
      ],
    });
    expect(
      await preparePortalForLeaseTenant({
        actor: "owner@example.invalid",
        email: "new.tenant@example.invalid",
        name: "New Tenant",
        propertyId,
      })
    ).toBeNull();
    const [access] = await db().select().from(tenantAccess);
    expect(access).toMatchObject({ clerkUserId: "user_new", invoiceIds: [] });
    await db()
      .update(tenantAccess)
      .set({ invoiceIds: [invoiceId] });
    await preparePortalForLeaseTenant({
      actor: "owner@example.invalid",
      email: "new.tenant@example.invalid",
      name: "New Tenant",
      propertyId,
    });
    const [after] = await db().select().from(tenantAccess);
    expect(after.invoiceIds).toEqual([invoiceId]);
    expect(clerk.invite).not.toHaveBeenCalled();
  });
});
