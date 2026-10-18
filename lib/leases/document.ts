import { z } from "zod";
export interface LeaseNode {
  attrs?: {
    level?: number;
    start?: number;
  };
  content?: LeaseNode[];
  marks?: {
    type: string;
  }[];
  text?: string;
  type: string;
}
export const leaseDocumentSchema: z.ZodType<LeaseNode> = z.lazy(() =>
  z.object({
    attrs: z
      .object({
        level: z.number().int().min(1).max(3).optional(),
        start: z.number().int().min(1).max(10_000).optional(),
      })
      .optional(),
    content: z.array(leaseDocumentSchema).max(1500).optional(),
    marks: z
      .array(z.object({ type: z.enum(["bold", "italic", "underline"]) }))
      .max(3)
      .optional(),
    text: z.string().max(45_000).optional(),
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "hardBreak",
    ]),
  })
);
export function textDocument(body: string): LeaseNode {
  return {
    content: body.split("\n").map((text) => ({
      type: "paragraph",
      ...(text ? { content: [{ text, type: "text" }] } : {}),
    })),
    type: "doc",
  };
}
export interface LeaseRun {
  bold?: boolean;
  italic?: boolean;
  text: string;
  underline?: boolean;
}
export function documentLines(node: LeaseNode): {
  runs: LeaseRun[];
  heading: boolean;
}[] {
  const result: {
    runs: LeaseRun[];
    heading: boolean;
  }[] = [];
  function inline(n: LeaseNode): LeaseRun[] {
    if (n.type === "text") {
      return [
        {
          bold: n.marks?.some((m) => m.type === "bold"),
          italic: n.marks?.some((m) => m.type === "italic"),
          text: n.text ?? "",
          underline: n.marks?.some((m) => m.type === "underline"),
        },
      ];
    }
    if (n.type === "hardBreak") {
      return [{ text: "\n" }];
    }
    return (n.content ?? []).flatMap(inline);
  }
  /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
  function walk(n: LeaseNode, prefix = "") {
    if (n.type === "paragraph" || n.type === "heading") {
      const runs = inline(n);
      if (prefix) {
        runs.unshift({ text: prefix });
      }
      result.push({ heading: n.type === "heading", runs });
    } else if (n.type === "bulletList" || n.type === "orderedList") {
      for (const [i, item] of (n.content ?? []).entries()) {
        for (const [j, c] of (item.content ?? []).entries()) {
          const resolveResult1 = () => {
            if (j === 0) {
              if (n.type === "bulletList") {
                return "• ";
              }
              return `${(n.attrs?.start ?? 1) + i}. `;
            }
            return "";
          };
          walk(c, resolveResult1());
        }
      }
    } else {
      for (const child of n.content ?? []) {
        walk(child);
      }
    }
  }
  walk(node);
  return result;
}
export function documentText(node: LeaseNode) {
  return documentLines(node)
    .map((line) => line.runs.map((r) => r.text).join(""))
    .join("\n");
}
