import { z } from "zod";
export type LeaseNode = {
  type: string;
  text?: string;
  attrs?: { level?: number; start?: number };
  marks?: { type: string }[];
  content?: LeaseNode[];
};
export const leaseDocumentSchema: z.ZodType<LeaseNode> = z.lazy(() =>
  z.object({
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
    text: z.string().max(45000).optional(),
    attrs: z
      .object({
        level: z.number().int().min(1).max(3).optional(),
        start: z.number().int().min(1).max(10000).optional(),
      })
      .optional(),
    marks: z
      .array(z.object({ type: z.enum(["bold", "italic", "underline"]) }))
      .max(3)
      .optional(),
    content: z.array(leaseDocumentSchema).max(1500).optional(),
  }),
);
export function textDocument(body: string): LeaseNode {
  return {
    type: "doc",
    content: body
      .split("\n")
      .map((text) => ({
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      })),
  };
}
export type LeaseRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export function documentLines(
  node: LeaseNode,
): { runs: LeaseRun[]; heading: boolean }[] {
  const result: { runs: LeaseRun[]; heading: boolean }[] = [];
  function inline(n: LeaseNode): LeaseRun[] {
    if (n.type === "text")
      return [
        {
          text: n.text ?? "",
          bold: n.marks?.some((m) => m.type === "bold"),
          italic: n.marks?.some((m) => m.type === "italic"),
          underline: n.marks?.some((m) => m.type === "underline"),
        },
      ];
    if (n.type === "hardBreak") return [{ text: "\n" }];
    return (n.content ?? []).flatMap(inline);
  }
  function walk(n: LeaseNode, prefix = "") {
    if (n.type === "paragraph" || n.type === "heading") {
      const runs = inline(n);
      if (prefix) runs.unshift({ text: prefix });
      result.push({ runs, heading: n.type === "heading" });
    } else if (n.type === "bulletList" || n.type === "orderedList")
      (n.content ?? []).forEach((item, i) => {
        (item.content ?? []).forEach((c, j) =>
          walk(
            c,
            j === 0
              ? n.type === "bulletList"
                ? "• "
                : `${(n.attrs?.start ?? 1) + i}. `
              : "",
          ),
        );
      });
    else (n.content ?? []).forEach((c) => walk(c));
  }
  walk(node);
  return result;
}
export function documentText(node: LeaseNode) {
  return documentLines(node)
    .map((line) => line.runs.map((r) => r.text).join(""))
    .join("\n");
}
