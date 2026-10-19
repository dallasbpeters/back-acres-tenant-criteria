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
  GET as signingGet,
  POST as signingPost,
} from "../../app/api/lease-signing/[token]/route";
import { GET as download } from "../../app/api/tenant/leases/[packetId]/route";
import { POST as portalSign } from "../../app/api/tenant/leases/[packetId]/sign/route";
import { db } from "../../lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  leaseTemplates,
  removedRecords,
  residentLinks,
  tenantAccess,
} from "../../lib/db/schema";
import { tenantLeases, verifiedEmails } from "../../lib/tenant/leases";
import { pg, property, propertyId, reset, start } from "../stripe/harness";

const clerk = vi.hoisted(() => ({
  emails: [{ emailAddress: "Tenant@Example.invalid", status: "verified" }],
  userId: "user_tenant_a" as string | null,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      isAuthenticated: Boolean(clerk.userId),
      userId: clerk.userId,
    })
  ),
  currentUser: vi.fn(() =>
    Promise.resolve(
      clerk.userId
        ? {
            emailAddresses: clerk.emails.map((email) => ({
              emailAddress: email.emailAddress,
              verification: { status: email.status },
            })),
          }
        : null
    )
  ),
}));

const templateId = "55555555-5555-4555-8555-555555555555";
const draftId = "66666666-6666-4666-8666-666666666666";
const packetId = "77777777-7777-4777-8777-777777777777";
const linkId = "33333333-3333-4333-8333-333333333333";
const accessId = "44444444-4444-4444-8444-444444444444";
const basePdf = Buffer.from("%PDF-1.4 frozen fixture").toString("base64");
const finalPdf = Buffer.from("%PDF-1.4 signed fixture").toString("base64");

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE lease_signers, lease_packets, lease_drafts, lease_templates, tenant_access, resident_links CASCADE"
  );
  clerk.userId = "user_tenant_a";
  clerk.emails = [
    { emailAddress: "Tenant@Example.invalid", status: "verified" },
  ];
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function lease(
  signers: { email: string; signedAt?: Date }[],
  patch: Partial<typeof leasePackets.$inferInsert> = {}
) {
  await property();
  const d = db();
  await d
    .insert(leaseTemplates)
    .values({ body: "Fixture", id: templateId, name: "Fixture" })
    .onConflictDoNothing();
  await d.insert(leaseDrafts).values({
    body: "Fixture lease",
    id: draftId,
    propertyId,
    templateId,
    tenantName: "Tenant A",
  });
  await d.insert(leasePackets).values({
    basePdf,
    body: "Fixture lease",
    brandName: "Back Acres Rental",
    documentHash: "fixture-hash",
    draftId,
    expiresAt: new Date("2099-01-01"),
    familyId: draftId,
    id: packetId,
    ...patch,
  });
  await d.insert(leaseSigners).values(
    signers.map((signer, index) => ({
      email: signer.email,
      id: `8888888${index}-8888-4888-8888-888888888888`,
      name: `Signer ${index}`,
      packetId,
      role: index ? "landlord" : "tenant",
      signedAt: signer.signedAt ?? null,
      tokenHash: `token-${index}`,
    }))
  );
}
// Call after lease(), which creates the property.
async function grant() {
  await db()
    .insert(residentLinks)
    .values({
      expiresAt: new Date("2099-01-01"),
      id: linkId,
      propertyId,
      residentName: "Tenant A",
    })
    .onConflictDoNothing();
  await db()
    .insert(tenantAccess)
    .values({
      clerkUserId: "user_tenant_a",
      id: accessId,
      name: "Tenant A",
      propertyId,
      residentLinkId: linkId,
    })
    .onConflictDoNothing();
}
const get = (id = packetId) =>
  download(
    new NextRequest(`https://rental.example.invalid/api/tenant/leases/${id}`),
    { params: Promise.resolve({ packetId: id }) }
  );

describe("tenant lease archive", () => {
  it("uses verified email addresses only", () => {
    expect(
      verifiedEmails({
        emailAddresses: [
          {
            emailAddress: "Verified@Example.invalid",
            verification: { status: "verified" },
          },
          {
            emailAddress: "pending@example.invalid",
            verification: { status: "unverified" },
          },
        ],
      })
    ).toEqual(["verified@example.invalid"]);
  });
  it("lists a lease the tenant signs, with signing progress", async () => {
    await lease([
      { email: "tenant@example.invalid", signedAt: new Date("2026-10-01") },
      { email: "owner@example.invalid" },
    ]);
    const [row] = await tenantLeases(propertyId, ["tenant@example.invalid"]);
    expect(row).toMatchObject({
      id: packetId,
      signed: 1,
      signers: 2,
      status: "awaiting",
      tenantName: "Tenant A",
    });
    expect(row.mySignedAt).toBeInstanceOf(Date);
  });
  it("hides leases where the tenant is not a signer, or that were voided or removed", async () => {
    await lease([{ email: "other@example.invalid" }]);
    expect(await tenantLeases(propertyId, ["tenant@example.invalid"])).toEqual(
      []
    );
    await pg.exec("TRUNCATE lease_signers, lease_packets CASCADE");
    await db()
      .insert(leasePackets)
      .values({
        basePdf,
        body: "Fixture lease",
        brandName: "Back Acres Rental",
        documentHash: "fixture-hash",
        draftId,
        expiresAt: new Date("2099-01-01"),
        familyId: draftId,
        id: packetId,
        status: "voided",
      });
    await db().insert(leaseSigners).values({
      email: "tenant@example.invalid",
      id: "88888880-8888-4888-8888-888888888888",
      name: "Signer",
      packetId,
      role: "tenant",
      tokenHash: "token-voided",
    });
    expect(await tenantLeases(propertyId, ["tenant@example.invalid"])).toEqual(
      []
    );
    await db().update(leasePackets).set({ status: "awaiting" });
    expect(
      await tenantLeases(propertyId, ["tenant@example.invalid"])
    ).toHaveLength(1);
    await db().insert(removedRecords).values({
      actor: "owner@example.invalid",
      entityId: draftId,
      groupId: draftId,
      kind: "lease",
      label: "Fixture lease",
    });
    expect(await tenantLeases(propertyId, ["tenant@example.invalid"])).toEqual(
      []
    );
  });
  it("downloads the signed PDF only for an assigned tenant who signs the lease", async () => {
    await lease(
      [
        { email: "tenant@example.invalid", signedAt: new Date("2026-10-01") },
        { email: "owner@example.invalid", signedAt: new Date("2026-10-02") },
      ],
      { finalHash: "final-hash", finalPdf, status: "completed" }
    );
    expect((await get()).status).toBe(404);
    await grant();
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "lease-signed-"
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "%PDF-1.4 signed fixture"
    );
  });
  it("serves the frozen review copy while signatures are outstanding", async () => {
    await lease([{ email: "tenant@example.invalid" }]);
    await grant();
    const response = await get();
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "%PDF-1.4 frozen fixture"
    );
  });
  it.each([
    [
      "signed out",
      () => {
        clerk.userId = null;
      },
      401,
    ],
    [
      "an unverified email",
      () => {
        clerk.emails = [
          { emailAddress: "tenant@example.invalid", status: "unverified" },
        ];
      },
      404,
    ],
    [
      "revoked access",
      async () => {
        await db().update(tenantAccess).set({ revokedAt: new Date() });
      },
      404,
    ],
  ])("refuses %s", async (_label, change, status) => {
    await lease([{ email: "tenant@example.invalid" }]);
    await grant();
    await change();
    expect((await get()).status).toBe(status);
  });
  it("rejects a malformed packet id", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
  });
});

const origin = "https://rental.example.invalid";
const signFromPortal = () =>
  portalSign(
    new NextRequest(`${origin}/api/tenant/leases/${packetId}/sign`, {
      headers: { origin },
      method: "POST",
    }),
    { params: Promise.resolve({ packetId }) }
  );

describe("signing without a second email code", () => {
  it("opens signing from the portal and starts a session without a code", async () => {
    await lease([{ email: "tenant@example.invalid" }]);
    await grant();
    const opening = await signFromPortal();
    expect(opening.status).toBe(200);
    const [, , , token] = ((await opening.json()).url as string).split("/");
    const params = { params: Promise.resolve({ token }) };
    const url = `${origin}/api/lease-signing/${token}`;
    expect(
      (await (await signingGet(new NextRequest(url), params)).json()).verified
    ).toBe(false);
    const opened = await signingPost(
      new NextRequest(url, {
        body: JSON.stringify({ action: "open" }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      }),
      params
    );
    expect(opened.status).toBe(200);
    const { session } = await opened.json();
    const record = await (
      await signingGet(
        new NextRequest(url, {
          headers: { authorization: `Bearer ${session}` },
        }),
        params
      )
    ).json();
    expect(record).toMatchObject({ name: "Signer 0", verified: true });
  });
  it("does not open signing for a tenant who is not a signer or already signed", async () => {
    await lease([
      { email: "tenant@example.invalid", signedAt: new Date("2026-10-01") },
      { email: "owner@example.invalid" },
    ]);
    await grant();
    expect((await signFromPortal()).status).toBe(409);
    clerk.emails = [
      { emailAddress: "someone@example.invalid", status: "verified" },
    ];
    expect((await signFromPortal()).status).toBe(404);
  });
});
