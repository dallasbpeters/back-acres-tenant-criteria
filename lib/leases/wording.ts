import { Node, type JSONContent } from "@tiptap/core";
import { fieldLabel } from "../management/lease-workflow";
export const LeaseDetail = Node.create({
  name: "leaseDetail",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { field: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-lease-detail]",
        getAttrs: (element) => ({
          field: element.getAttribute("data-lease-detail"),
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-lease-detail": node.attrs.field,
        class: "lease-detail-chip",
        contenteditable: "false",
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
    type: "doc",
    content: body.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      for (const match of line.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
        if (match.index! > last)
          content.push({ type: "text", text: line.slice(last, match.index) });
        content.push({ type: "leaseDetail", attrs: { field: match[1] } });
        last = match.index! + match[0].length;
      }
      if (last < line.length)
        content.push({ type: "text", text: line.slice(last) });
      return { type: "paragraph", ...(content.length ? { content } : {}) };
    }),
  };
}
