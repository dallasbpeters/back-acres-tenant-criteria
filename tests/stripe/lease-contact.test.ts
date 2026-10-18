import "./harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  leaseTemplates,
} from "../../lib/db/schema";
import { leaseContact } from "../../lib/leases/contact";
import { pg, property, propertyId, reset, start } from "./harness";

beforeAll(start);
afterAll(async () => {
  await pg.close();
});
describe("personalized lease contact", () => {
  it("returns only that packet's named landlord contacts, with a brand fallback", async () => {
    await reset();
    await property();
    const d = db(),
      template = crypto.randomUUID(),
      draft = crypto.randomUUID(),
      packet = crypto.randomUUID(),
      other = crypto.randomUUID();
    await d
      .insert(leaseTemplates)
      .values({ body: "TEST", id: template, name: "TEST" });
    await d.insert(leaseDrafts).values({
      body: "TEST",
      id: draft,
      propertyId,
      templateId: template,
      tenantName: "TEST",
    });
    await d.insert(leasePackets).values([
      {
        basePdf: "TEST",
        body: "TEST",
        brandName: "Back Acres",
        documentHash: "TEST",
        draftId: draft,
        expiresAt: new Date("2099-01-01"),
        familyId: crypto.randomUUID(),
        id: packet,
      },
      {
        basePdf: "TEST",
        body: "TEST",
        brandName: "Other",
        documentHash: "TEST",
        draftId: draft,
        expiresAt: new Date("2099-01-01"),
        familyId: crypto.randomUUID(),
        id: other,
        status: "voided",
      },
    ]);
    await d.insert(leaseSigners).values([
      {
        email: "contact@example.invalid",
        id: "11111111-1111-4111-8111-111111111111",
        name: "Named Contact",
        packetId: packet,
        role: "landlord",
        tokenHash: "contact",
      },
      {
        email: "roommate@example.invalid",
        id: crypto.randomUUID(),
        name: "Private roommate",
        packetId: packet,
        role: "tenant",
        tokenHash: "tenant",
      },
      {
        email: "other@example.invalid",
        id: crypto.randomUUID(),
        name: "Other property",
        packetId: other,
        role: "landlord",
        tokenHash: "other",
      },
    ]);
    expect(await leaseContact(packet, "Back Acres")).toBe(
      "Named Contact (contact@example.invalid)"
    );
    expect(await leaseContact(crypto.randomUUID(), "Back Acres")).toBe(
      "Back Acres"
    );
    await d.insert(leaseSigners).values({
      email: "second@example.invalid",
      id: "22222222-2222-4222-8222-222222222222",
      name: "Second Contact",
      packetId: packet,
      role: "landlord",
      tokenHash: "second",
    });
    expect(await leaseContact(packet, "Back Acres")).toBe(
      "Named Contact (contact@example.invalid) or Second Contact (second@example.invalid)"
    );
  });
});
