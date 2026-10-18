import type { LeaseRun } from "./document";

type Line = { runs: LeaseRun[]; heading: boolean };
export type LeaseTerm = { label: string; value: string };

/** Recognize the template's summary without consuming any following lease text. */
export function leaseTerms(lines: Line[], start: number) {
  const text = (line: Line) => line.runs.map((run) => run.text).join("");
  if (text(lines[start]).trim() !== "TERMS") return null;
  const fields: LeaseTerm[] = [];
  let end = start;
  for (let index = start + 1; index < lines.length; index++) {
    const value = text(lines[index]);
    if (!value.trim()) continue;
    const match = /^([^:\n]{1,60}:)[ \t]*(.{0,300})$/.exec(value);
    if (!match || lines[index].heading) break;
    fields.push({ label: match[1], value: match[2] });
    end = index;
  }
  // Custom prose or unusually large summaries retain the original paragraph layout.
  return fields.length >= 2 && fields.length <= 12 ? { fields, end } : null;
}
