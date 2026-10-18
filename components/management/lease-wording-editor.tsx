// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { LeaseDetail, wordingDocument } from "@/lib/leases/wording";
import { fieldLabel } from "@/lib/management/lease-workflow";
import { leaseFields } from "@/lib/management/leases";
export function LeaseWordingEditor({
  body,
  onChange,
  disabled,
}: {
  body: string;
  onChange: (body: string) => void;
  disabled: boolean;
}) {
  const [detail, setDetail] = useState("property_address");
  const editor = useEditor({
    content: wordingDocument(body),
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": "Lease wording",
        "aria-multiline": "true",
        class: "lease-wording-content",
        role: "textbox",
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      LeaseDetail,
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: editorLocal }) =>
      onChange(editorLocal.getText({ blockSeparator: "\n" })),
  });

  return (
    <div className="lease-wording-editor">
      <div className="lease-wording-tools">
        <AppSelect
          disabled={disabled}
          label="Insert a lease detail"
          onValueChange={setDetail}
          value={detail}
        >
          {leaseFields.map((key) => (
            <option key={key} value={key}>
              {fieldLabel(key)}
            </option>
          ))}
        </AppSelect>
        <Button
          disabled={!editor || disabled}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertContent({ attrs: { field: detail }, type: "leaseDetail" })
              .run()
          }
          type="button"
        >
          Insert detail
        </Button>
      </div>
      <p className="small-note">
        Highlighted details fill in from the lease questions. Click where a
        detail belongs, then choose Insert detail.
      </p>
      <EditorContent editor={editor} />
    </div>
  );
}
