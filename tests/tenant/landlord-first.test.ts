// Register isolated database and owner-session fixtures before importing route code.
import "../stripe/harness";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as ownerSigning } from "../../app/api/admin/lease-signing/route";
import {
  GET as signingGet,
  POST as signingPost,
} from "../../app/api/lease-signing/[token]/route";
import { db } from "../../lib/db";
import {
  invoices,
  leaseDrafts,
  leaseSigners,
  leaseTemplates,
  tenantInvitations,
} from "../../lib/db/schema";
import { backfillLeaseDeposits } from "../../lib/leases/deposits";
import { digest } from "../../lib/leases/signing-model";
import {
  pg,
  property,
  propertyId,
  request,
  reset,
  start,
} from "../stripe/harness";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ isAuthenticated: false, userId: null })),
  createClerkClient: vi.fn(() => ({
    invitations: {
      createInvitation: vi.fn(() =>
        Promise.resolve({
          id: "inv_fixture",
          url: "https://clerk.example.invalid/accept?ticket=1",
        })
      ),
      getInvitationList: vi.fn(() => Promise.resolve({ data: [] })),
      revokeInvitation: vi.fn(() => Promise.resolve({})),
    },
    users: { getUserList: vi.fn(() => Promise.resolve({ data: [] })) },
  })),
}));

const origin = "https://rental.example.invalid";
const draftId = "66666666-6666-4666-8666-666666666666";
const templateId = "55555555-5555-4555-8555-555555555555";
let mail: {
  text: string;
  attachments: { filename: string }[];
  subject: string;
  to: string[];
}[];

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE lease_signers, lease_packets, lease_drafts, lease_templates, tenant_invitations, rental_invoices CASCADE"
  );
  vi.stubEnv("RESEND_API_KEY", "re_fixture");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("FROM_EMAIL", "Back Acres <leases@example.invalid>");
  mail = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      if (url !== "https://api.resend.com/emails") {
        throw new Error(`Unexpected request to ${url}`);
      }
      mail.push(JSON.parse(String(init.body)));
      return Promise.resolve(Response.json({ id: "email_fixture" }));
    })
  );
  await property();
  await db()
    .insert(leaseTemplates)
    .values({ body: "Lease", id: templateId, name: "Lease" });
  await db()
    .insert(leaseDrafts)
    .values({
      body: "RESIDENTIAL LEASE\n\n1. PARTIES. Landlord and Tenant agree.\n\n§ Signatures\n\nTenant signature: ________ Date: ______\n\n§ Clauses\n\n2. RENT. Tenant pays rent monthly.\n\n3. LEAD. Tenant received the lead pamphlet. Tenant initials: __________.",
      id: draftId,
      propertyId,
      templateId,
      tenantName: "Tenant A",
      values: {
        security_deposit: "$1,250.00",
        start_date: "2099-01-01",
      } as never,
    });
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const owner = (body: unknown) =>
  ownerSigning(request("/api/admin/lease-signing", body));
const signature = async () =>
  `data:image/png;base64,${(
    await sharp({
      create: {
        background: { alpha: 1, b: 0, g: 0, r: 0 },
        channels: 4,
        height: 60,
        width: 200,
      },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;

async function signWith(
  token: string,
  name: string,
  { initials = true }: { initials?: boolean } = {}
) {
  const params = { params: Promise.resolve({ token }) };
  const url = `${origin}/api/lease-signing/${token}`;
  const opened = await signingPost(
    new NextRequest(url, {
      body: JSON.stringify({ action: "open" }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    }),
    params
  );
  const { session } = await opened.json();
  const auth = { authorization: `Bearer ${session}` };
  await signingGet(
    new NextRequest(`${url}?format=pdf`, { headers: auth }),
    params
  );
  const record = await (
    await signingGet(new NextRequest(url, { headers: auth }), params)
  ).json();
  const signed = await signingPost(
    new NextRequest(url, {
      body: JSON.stringify({
        action: "sign",
        consent: true,
        consentVersion: record.consentVersion,
        documentHash: record.documentHash,
        ...(initials && record.initialSpots.length
          ? {
              initialed: record.initialSpots.map(
                (spot: { index: number }) => spot.index
              ),
              initials: "TA",
            }
          : {}),
        name,
        signature: await signature(),
      }),
      headers: { "content-type": "application/json", origin, ...auth },
      method: "POST",
    }),
    params
  );
  return {
    auth,
    params,
    record,
    signed: await signed.json(),
    status: signed.status,
    url,
  };
}

describe("landlord signs first", () => {
  it("emails tenants only after the landlord signs, then draws signatures on the PDF", async () => {
    const created = await owner({
      action: "create",
      data: {
        draftId,
        reviewed: true,
        signers: [
          { email: "tenant@example.invalid", name: "Tenant A", role: "tenant" },
          { email: "owner@example.invalid", name: "Owner B", role: "landlord" },
        ],
      },
    });
    expect(created.status).toBe(201);
    const { id: packetId } = await created.json();
    expect(mail).toHaveLength(0);

    const opening = await owner({ action: "signAsOwner", packetId });
    expect(opening.status).toBe(200);
    const [, , , landlordToken] = ((await opening.json()).url as string).split(
      "/"
    );
    const landlord = await signWith(landlordToken, "Owner B");
    expect(landlord.signed).toMatchObject({ invited: 1, ok: true });

    const invite = mail.find((m) => m.to[0] === "tenant@example.invalid");
    expect(invite?.subject).toContain("review and sign your lease");
    // Sending the tenant's link also sets up their portal access.
    expect(invite?.text).toContain(
      "https://clerk.example.invalid/accept?ticket=1"
    );
    const invitations = await db().select().from(tenantInvitations);
    expect(invitations).toMatchObject([
      {
        email: "tenant@example.invalid",
        name: "Tenant A",
        propertyId,
        status: "pending",
      },
    ]);
    const receipt = mail.find((m) => m.to[0] === "owner@example.invalid");
    expect(receipt?.subject).toContain("you signed your lease");

    // The copy a tenant downloads already shows the landlord's signature page.
    const pdf = await signingGet(
      new NextRequest(`${landlord.url}?format=pdf`, { headers: landlord.auth }),
      landlord.params
    );
    const document = await PDFDocument.load(await pdf.arrayBuffer());
    // Signature blocks sit in the lease's own Signatures section.
    expect(document.getKeywords()).toContain("sigpos:");
    expect(document.getKeywords()).toContain("initpos:");

    // Reissue the tenant link the way the portal does, then sign as tenant.
    const tenantToken = "a".repeat(64);
    await db()
      .update(leaseSigners)
      .set({ tokenHash: digest(tenantToken) })
      .where(eq(leaseSigners.email, "tenant@example.invalid"));
    mail = [];
    const refused = await signWith(tenantToken, "Tenant A", {
      initials: false,
    });
    expect(refused.status).toBe(400);
    expect(refused.record.initialSpots).toEqual([
      expect.objectContaining({ index: 0, role: "tenant" }),
    ]);
    await signWith(tenantToken, "Tenant A");
    const finished = mail.filter((m) =>
      m.subject.includes("your lease is fully signed")
    );
    expect(
      finished.map((m) => m.to[0]).sort((a, b) => a.localeCompare(b))
    ).toEqual(["owner@example.invalid", "tenant@example.invalid"]);
    expect(finished[0].attachments.map((a) => a.filename)).toContain(
      "signed-lease.pdf"
    );
    // The fully signed lease requests its deposit and shares it.
    const deposits = await db().select().from(invoices);
    expect(deposits).toEqual([
      expect.objectContaining({
        amountCents: 125_000,
        category: "deposit",
        description: "Security deposit",
        dueDate: "2099-01-01",
      }),
    ]);
    const [invitation] = await db().select().from(tenantInvitations);
    expect(invitation.invoiceIds).toEqual([deposits[0].id]);
    // A lease signed before automatic deposits gets its deposit once.
    await pg.exec("TRUNCATE rental_invoices CASCADE");
    expect(await backfillLeaseDeposits()).toBe(1);
    expect(await backfillLeaseDeposits()).toBe(0);
  });
  it("handles a tenant with only a mobile number", async () => {
    const created = await owner({
      action: "create",
      data: {
        draftId,
        reviewed: true,
        signers: [
          {
            email: "",
            name: "Tenant A",
            phone: "(806) 555-0123",
            role: "tenant",
          },
          { email: "owner@example.invalid", name: "Owner B", role: "landlord" },
        ],
      },
    });
    expect(created.status).toBe(201);
    const { id: packetId } = await created.json();
    const [tenant] = await db()
      .select()
      .from(leaseSigners)
      .where(eq(leaseSigners.role, "tenant"));
    expect(tenant).toMatchObject({ email: null, phone: "+18065550123" });

    const opening = await owner({ action: "signAsOwner", packetId });
    const [, , , landlordToken] = ((await opening.json()).url as string).split(
      "/"
    );
    const landlord = await signWith(landlordToken, "Owner B");
    // No email to send: the owner texts the tenant's link instead.
    expect(landlord.signed).toMatchObject({ invited: 0, ok: true });
    expect(mail.some((m) => m.to[0] !== "owner@example.invalid")).toBe(false);
    expect(
      (await owner({ action: "invite", signerId: tenant.id })).status
    ).toBe(409);

    const link = await owner({ action: "link", signerId: tenant.id });
    expect(link.status).toBe(200);
    const tenantToken =
      ((await link.json()).url as string).split("/").at(-1) ?? "";
    mail = [];
    await signWith(tenantToken, "Tenant A");
    // Only the landlord has an email for the signed copy.
    expect(mail.map((m) => m.to[0])).toEqual(["owner@example.invalid"]);
  });
  it("needs an email or a valid mobile number for each tenant", async () => {
    const response = await owner({
      action: "create",
      data: {
        draftId,
        reviewed: true,
        signers: [
          { email: "", name: "Tenant A", phone: "555", role: "tenant" },
          { email: "owner@example.invalid", name: "Owner B", role: "landlord" },
        ],
      },
    });
    expect(response.status).toBe(400);
  });
});
