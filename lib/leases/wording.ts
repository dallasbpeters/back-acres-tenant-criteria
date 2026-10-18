import { type JSONContent, Node } from "@tiptap/core";
import { requireValue } from "@/lib/required";
import { fieldLabel } from "../management/lease-workflow";
export const LeaseDetail = Node.create({
  addAttributes() {
    return { field: { default: "" } };
  },
  atom: true,
  group: "inline",
  inline: true,
  name: "leaseDetail",
  parseHTML() {
    return [
      {
        getAttrs: (element) => ({
          field: element.getAttribute("data-lease-detail"),
        }),
        tag: "span[data-lease-detail]",
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        class: "lease-detail-chip",
        contenteditable: "false",
        "data-lease-detail": node.attrs.field,
      },
      fieldLabel(node.attrs.field),
    ];
  },
  renderText({ node }) {
    return `{{${node.attrs.field}}}`;
  },
});
export function wordingDocument(body: string): JSONContent {
  return {
    content: body.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      for (const match of line.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
        if (requireValue(match.index, "Expected match.index") > last) {
          content.push({ text: line.slice(last, match.index), type: "text" });
        }
        content.push({ attrs: { field: match[1] }, type: "leaseDetail" });
        last =
          requireValue(match.index, "Expected match.index") + match[0].length;
      }
      if (last < line.length) {
        content.push({ text: line.slice(last), type: "text" });
      }
      return { type: "paragraph", ...(content.length ? { content } : {}) };
    }),
    type: "doc",
  };
}
