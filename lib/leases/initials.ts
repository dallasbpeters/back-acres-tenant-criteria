import { z } from "zod";

/** "Tenant initials: ______", "Landlord's initials ____" and similar. */
const spotPattern =
  /\b(tenant|landlord|resident|owner)?(?:['’]s)?\s*initials?\s*:?\s*(_{3,})/gi;
const wordPattern = /[A-Za-z]+/g;
const blankPattern = /_{3,}/;
const lineBreak = /\n/;
const spaces = /\s+/g;
const labelPattern = /initials?:?$/i;
const blankStart = /^_{3,}/;

export type InitialRole = "landlord" | "tenant";
export interface InitialSpot {
  /** Text around the blank, so the signer knows what they acknowledge. */
  excerpt: string;
  /** Order of the spot in the lease, from 0. */
  index: number;
  role: InitialRole;
}

const roleOf = (word: string | undefined): InitialRole =>
  word && ["landlord", "owner"].includes(word.toLowerCase())
    ? "landlord"
    : "tenant";

/** Every initials blank in a lease's text, in reading order. */
export function initialSpots(body: string): InitialSpot[] {
  const spots: InitialSpot[] = [];
  for (const match of body.matchAll(spotPattern)) {
    const at = match.index ?? 0;
    // The paragraph the blank is in, so the signer sees what they confirm.
    const paragraph = body.slice(body.lastIndexOf("\n", at) + 1, at);
    const lead = paragraph.slice(-260).trim();
    const after = body.slice(at + match[0].length).split(lineBreak)[0] ?? "";
    const excerpt = `${lead} ${match[0].replace(blankPattern, "____")}${after}`
      .replace(spaces, " ")
      .trim()
      .slice(0, 320);
    spots.push({ excerpt, index: spots.length, role: roleOf(match[1]) });
  }
  return spots;
}

/** Suggested initials from a full name: "Tell Fuller" becomes "TF". */
export function defaultInitials(name: string) {
  return (name.match(wordPattern) ?? [])
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export const initialsInput = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z. -]{0,7}$/, "Enter your initials, such as TF.");

/**
 * Whether one word ends an "initials:" label, so the blank after it is an
 * initials spot. Used while laying out the PDF.
 */
export const isInitialsLabel = (word: string) => labelPattern.test(word);
export const isBlank = (word: string) => blankStart.test(word);
export { roleOf as initialRoleOf };
