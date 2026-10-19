import { z } from "zod";

export const insuranceMaxBytes = 10_000_000;
const pathSeparator = /[\\/]/;
const extensionPattern = /\.[^.]*$/;
const unsafeNameCharacters = /[^\w .()-]+/g;
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "Use a real date.",
  });

export const insuranceDetailsSchema = z
  .object({
    carrier: z.string().trim().min(1).max(120),
    endsOn: isoDate,
    policyNumber: z.string().trim().min(1).max(80),
    startsOn: isoDate,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The end date must be on or after the start date.",
    path: ["endsOn"],
  });

export const insuranceReviewSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(500).default(""),
  status: z.enum(["accepted", "rejected"]),
});

const kinds = [
  {
    contentType: "application/pdf",
    extension: "pdf",
    matches: (bytes: Buffer) => bytes.subarray(0, 5).toString() === "%PDF-",
  },
  {
    contentType: "image/jpeg",
    extension: "jpg",
    matches: (bytes: Buffer) =>
      bytes.length > 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  {
    contentType: "image/png",
    extension: "png",
    matches: (bytes: Buffer) =>
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
];

/** Identifies the file by its bytes; the browser-supplied type is not trusted. */
export function insuranceFileKind(bytes: Buffer) {
  if (!bytes.length || bytes.length > insuranceMaxBytes) {
    return null;
  }
  const kind = kinds.find((item) => item.matches(bytes));
  return kind
    ? { contentType: kind.contentType, extension: kind.extension }
    : null;
}

/** A display-only file name: no paths, quotes or control characters. */
export function safeFileName(name: string, extension: string) {
  const base = (name.split(pathSeparator).pop() ?? "")
    .replace(extensionPattern, "")
    .replace(unsafeNameCharacters, "")
    .trim()
    .slice(0, 80);
  return `${base || "insurance"}.${extension}`;
}

export type InsuranceStanding = "current" | "expiring" | "expired" | "future";

/** Policy standing on a given day (America/Chicago calendar date). */
export function insuranceStanding(
  startsOn: string,
  endsOn: string,
  today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  })
): InsuranceStanding {
  if (endsOn < today) {
    return "expired";
  }
  if (startsOn > today) {
    return "future";
  }
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return endsOn <= soon.toISOString().slice(0, 10) ? "expiring" : "current";
}
