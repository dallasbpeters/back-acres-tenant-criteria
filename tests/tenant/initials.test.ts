import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { findInitialBlanks } from "../../lib/leases/find-initials";
import { defaultInitials, initialSpots } from "../../lib/leases/initials";
import { leasePdf } from "../../lib/leases/pdf";
import { decodeInitialPositions } from "../../lib/leases/signature-page";

const body =
  "RESIDENTIAL LEASE\n\n1. PARTIES. Landlord and Tenant agree.\n\n2. LEAD. Tenant received the lead pamphlet. Tenant initials: __________.\n\nLandlord confirms delivery. Landlord's initials: ________";
const brand = { logoPng: null, name: "Back Acres Rental" };

describe("lease initials", () => {
  it("finds each blank and whose initials it needs", () => {
    expect(initialSpots(body)).toEqual([
      expect.objectContaining({ index: 0, role: "tenant" }),
      expect.objectContaining({ index: 1, role: "landlord" }),
    ]);
    expect(initialSpots(body)[0].excerpt).toContain(
      "Tenant received the lead pamphlet."
    );
    expect(defaultInitials("Tell  Fuller")).toBe("TF");
  });
  it("finds blanks in an older PDF where the new layout records them", async () => {
    const signers = [
      { email: "t@example.invalid", name: "Tenant A", role: "tenant" },
      { email: "o@example.invalid", name: "Owner B", role: "landlord" },
    ];
    const recorded = decodeInitialPositions(
      (
        await PDFDocument.load(
          await leasePdf(body, "ref", null, {
            ...brand,
            forSigning: true,
            signers,
          })
        )
      ).getKeywords() ?? ""
    );
    // Before positions were recorded: the same lease without signers.
    const found = await findInitialBlanks(
      await leasePdf(body, "ref", null, { ...brand, forSigning: true })
    );
    expect(recorded).toHaveLength(2);
    expect(found).toHaveLength(2);
    for (const [index, blank] of found.entries()) {
      const expected = recorded?.[index];
      expect(blank.role).toBe(expected?.role);
      expect(blank.y).toBeCloseTo(expected?.y ?? 0, 0);
      expect(Math.abs(blank.x - (expected?.x ?? 0))).toBeLessThan(2);
    }
  });
});
