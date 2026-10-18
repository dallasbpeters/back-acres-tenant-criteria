const pattern1 = /^([^:\n]{1,60}:)[ \t]*(.{0,300})$/;

import type { LeaseRun } from "./document";

interface Line {
  heading: boolean;
  runs: LeaseRun[];
}
export interface LeaseTerm {
  label: string;
  value: string;
}

/** Recognize the template's summary without consuming any following lease text. */
export function leaseTerms(lines: Line[], start: number) {
  const text = (line: Line) => line.runs.map((run) => run.text).join("");
  if (text(lines[start]).trim() !== "TERMS") {
    return null;
  }
  const fields: LeaseTerm[] = [];
  let end = start;
  for (let index = start + 1; index < lines.length; index += 1) {
    const value = text(lines[index]);
    if (!value.trim()) {
      continue;
    }
    const match = pattern1.exec(value);
    if (!match || lines[index].heading) {
      break;
    }
    fields.push({ label: match[1], value: match[2] });
    end = index;
  }
  // Custom prose or unusually large summaries retain the original paragraph layout.
  return fields.length >= 2 && fields.length <= 12 ? { end, fields } : null;
}
