"use client";
import { LeaseDetail, wordingDocument } from "@/lib/leases/wording";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { AppSelect } from "@/components/ui/select";
import { leaseFields } from "@/lib/management/leases";
import { fieldLabel } from "@/lib/management/lease-workflow";
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
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        link: false,
        underline: false,
        trailingNode: false,
      }),
      LeaseDetail,
    ],
    content: wordingDocument(body),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Lease wording",
        "aria-multiline": "true",
        class: "lease-wording-content",
      },
    },
    onUpdate: ({ editor }) =>
      onChange(editor.getText({ blockSeparator: "\n" })),
    editable: !disabled,
  });
  return (
    <div className="lease-wording-editor">
      <div className="lease-wording-tools">
        <AppSelect
          label="Insert a lease detail"
          value={detail}
          onValueChange={setDetail}
          disabled={disabled}
        >
          {leaseFields.map((key) => (
            <option key={key} value={key}>
              {fieldLabel(key)}
            </option>
          ))}
        </AppSelect>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertContent({ type: "leaseDetail", attrs: { field: detail } })
              .run()
          }
        >
          Insert detail
        </button>
      </div>
      <p className="small-note">
        Highlighted details fill in from the lease questions. Click where a
        detail belongs, then choose Insert detail.
      </p>
      <EditorContent editor={editor} />
    </div>
  );
}
