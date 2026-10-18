"use client";
import { useEffect, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  textDocument,
  documentText,
  type LeaseNode,
} from "@/lib/leases/document";
export function LeaseTextEditor({
  label,
  body,
  document,
  onChange,
  disabled = false,
  compact = false,
  plain = false,
}: {
  label: string;
  body: string;
  document?: LeaseNode | null;
  onChange: (text: string, document: LeaseNode) => void;
  disabled?: boolean;
  compact?: boolean;
  plain?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: plain ? false : { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        trailingNode: false,
        ...(plain ? { bold: false, italic: false, underline: false } : {}),
      }),
    ],
    content: document ?? textDocument(body),
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: `lease-rich-content${compact ? " lease-rich-compact" : ""}`,
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getJSON() as LeaseNode;
      onChange(documentText(content), content);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  return (
    <div className="lease-rich-editor">
      <div
        className="editor-tools"
        role="toolbar"
        aria-label={`${label} formatting`}
      >
        {!plain && (
          <>
            <button
              type="button"
              disabled={!editor || disabled}
              aria-pressed={editor?.isActive("bold") ?? false}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              Bold
            </button>
            <button
              type="button"
              disabled={!editor || disabled}
              aria-pressed={editor?.isActive("italic") ?? false}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              Italic
            </button>
            <button
              type="button"
              disabled={!editor || disabled}
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              Heading
            </button>
          </>
        )}
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          Redo
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function LeaseDocumentPreview({ document }: { document: LeaseNode }) {
  function render(n: LeaseNode, key: number): ReactNode {
    const children = n.content?.map(render);
    if (n.type === "text") {
      let text: ReactNode = n.text;
      for (const mark of n.marks ?? [])
        text =
          mark.type === "bold" ? (
            <strong>{text}</strong>
          ) : mark.type === "italic" ? (
            <em>{text}</em>
          ) : (
            <u>{text}</u>
          );
      return <span key={key}>{text}</span>;
    }
    if (n.type === "heading")
      return n.attrs?.level === 3 ? (
        <h3 key={key}>{children}</h3>
      ) : (
        <h2 key={key}>{children}</h2>
      );
    if (n.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (n.type === "orderedList")
      return (
        <ol key={key} start={n.attrs?.start}>
          {children}
        </ol>
      );
    if (n.type === "listItem") return <li key={key}>{children}</li>;
    if (n.type === "hardBreak") return <br key={key} />;
    if (n.type === "paragraph")
      return <p key={key}>{children?.length ? children : <br />}</p>;
    return <div key={key}>{children}</div>;
  }
  return (
    <article className="lease-document" aria-label="Lease draft preview">
      {render(document, 0)}
    </article>
  );
}
