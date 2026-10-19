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
import { GET as ownerDownload } from "../../app/api/admin/insurance/[id]/route";
import {
  GET as ownerList,
  POST as ownerReview,
} from "../../app/api/admin/insurance/route";
import { GET as tenantDownload } from "../../app/api/tenant/insurance/[id]/route";
import { POST as upload } from "../../app/api/tenant/insurance/route";
import { db } from "../../lib/db";
import {
  insuranceDocuments,
  residentLinks,
  tenantAccess,
} from "../../lib/db/schema";
import {
  insuranceFileKind,
  insuranceStanding,
  safeFileName,
} from "../../lib/tenant/insurance";
import {
  pg,
  property,
  propertyId,
  request,
  reset,
  start,
  state,
} from "../stripe/harness";

const clerk = vi.hoisted(() => ({ userId: "user_tenant_a" as string | null }));
const blob = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      isAuthenticated: Boolean(clerk.userId),
      userId: clerk.userId,
    })
  ),
}));
vi.mock("@vercel/blob", () => ({ get: blob.get, put: blob.put }));

const linkId = "33333333-3333-4333-8333-333333333333";
const accessId = "44444444-4444-4444-8444-444444444444";
const pdf = Buffer.from("%PDF-1.7 fixture declarations page");

beforeAll(start);
beforeEach(async () => {
  await reset();
  await pg.exec(
    "TRUNCATE insurance_documents, tenant_access, resident_links CASCADE"
  );
  clerk.userId = "user_tenant_a";
  blob.files.clear();
  blob.put.mockImplementation((path: string, bytes: Buffer) => {
    blob.files.set(path, bytes);
    return Promise.resolve({ pathname: path });
  });
  blob.get.mockImplementation((path: string) => {
    const bytes = blob.files.get(path);
    return Promise.resolve(
      bytes ? { stream: new Blob([new Uint8Array(bytes)]).stream() } : null
    );
  });
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
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
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(patch: Record<string, string | Blob> = {}) {
  const data = new FormData();
  const fields: Record<string, string | Blob> = {
    carrier: "Fixture Mutual",
    endsOn: "2027-06-30",
    file: new File([new Uint8Array(pdf)], '../Declarations "page".pdf', {
      type: "application/pdf",
    }),
    id: accessId,
    policyNumber: "RI-12345",
    startsOn: "2026-07-01",
    ...patch,
  };
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return upload(
    new NextRequest("https://rental.example.invalid/api/tenant/insurance", {
      body: data,
      headers: { origin: "https://rental.example.invalid" },
      method: "POST",
    })
  );
}
const download = (handler: typeof tenantDownload, id: string) =>
  handler(
    new NextRequest(`https://rental.example.invalid/api/insurance/${id}`),
    { params: Promise.resolve({ id }) }
  );

describe("renters insurance uploads", () => {
  it("identifies files by their bytes and cleans display names", () => {
    expect(insuranceFileKind(pdf)?.contentType).toBe("application/pdf");
    expect(insuranceFileKind(Buffer.from("<html>not a pdf"))).toBeNull();
    expect(safeFileName('../Declarations "page".exe', "pdf")).toBe(
      "Declarations page.pdf"
    );
    expect(insuranceStanding("2026-01-01", "2026-10-01", "2026-10-18")).toBe(
      "expired"
    );
    expect(insuranceStanding("2026-01-01", "2026-11-01", "2026-10-18")).toBe(
      "expiring"
    );
    expect(insuranceStanding("2026-01-01", "2027-06-30", "2026-10-18")).toBe(
      "current"
    );
    expect(insuranceStanding("2026-11-01", "2027-11-01", "2026-10-18")).toBe(
      "future"
    );
  });
  it("stores a tenant upload privately with its policy details", async () => {
    const response = await form();
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const [row] = await db().select().from(insuranceDocuments);
    expect(row).toMatchObject({
      carrier: "Fixture Mutual",
      contentType: "application/pdf",
      endsOn: "2027-06-30",
      fileName: "Declarations page.pdf",
      id,
      policyNumber: "RI-12345",
      propertyId,
      status: "pending",
      tenantAccessId: accessId,
    });
    expect(blob.put).toHaveBeenCalledWith(
      `insurance/${propertyId}/${id}.pdf`,
      expect.any(Buffer),
      expect.objectContaining({ access: "private" })
    );
    const file = await download(tenantDownload, id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await file.arrayBuffer()).equals(pdf)).toBe(true);
  });
  it.each([
    [
      "a file that is not a PDF or image",
      {
        file: new File(["<script>"], "policy.pdf", {
          type: "application/pdf",
        }),
      },
    ],
    ["missing policy details", { carrier: "" }],
    ["an end date before the start date", { endsOn: "2026-01-01" }],
  ])("rejects %s", async (_label, patch) => {
    expect((await form(patch)).status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("refuses uploads to another account's tenancy or while signed out", async () => {
    clerk.userId = "user_tenant_b";
    expect((await form()).status).toBe(404);
    clerk.userId = null;
    expect((await form()).status).toBe(401);
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("hides an upload from other accounts and after access is revoked", async () => {
    const { id } = await (await form()).json();
    clerk.userId = "user_tenant_b";
    expect((await download(tenantDownload, id)).status).toBe(404);
    clerk.userId = "user_tenant_a";
    await db().update(tenantAccess).set({ revokedAt: new Date() });
    expect((await download(tenantDownload, id)).status).toBe(404);
  });
  it("lets the owner list, download and review uploads", async () => {
    const { id } = await (await form()).json();
    const list = await (
      await ownerList(
        new NextRequest("https://rental.example.invalid/api/admin/insurance")
      )
    ).json();
    expect(list.documents).toEqual([
      expect.objectContaining({
        id,
        propertyName: "Fixture",
        status: "pending",
        tenantName: "Tenant A",
      }),
    ]);
    expect((await download(ownerDownload, id)).status).toBe(200);
    expect(
      (
        await ownerReview(
          request("/api/admin/insurance", { id, status: "rejected" })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await ownerReview(
          request("/api/admin/insurance", {
            id,
            note: "Add Back Acres as an interested party.",
            status: "rejected",
          })
        )
      ).status
    ).toBe(200);
    const [row] = await db().select().from(insuranceDocuments);
    expect(row).toMatchObject({
      reviewedBy: "owner@example.invalid",
      reviewNote: "Add Back Acres as an interested party.",
      status: "rejected",
    });
  });
  it("keeps owner routes closed without an owner session", async () => {
    const { id } = await (await form()).json();
    state.session = null;
    expect((await download(ownerDownload, id)).status).toBe(401);
    expect(
      (
        await ownerReview(
          request("/api/admin/insurance", { id, status: "accepted" })
        )
      ).status
    ).toBe(401);
  });
});
