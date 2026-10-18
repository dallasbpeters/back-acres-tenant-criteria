// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  documentText,
  type LeaseNode,
  textDocument,
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
    content: document ?? textDocument(body),
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        class: `lease-rich-content${compact ? " lease-rich-compact" : ""}`,
        role: "textbox",
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: plain ? false : { levels: [2, 3] },
        horizontalRule: false,
        link: false,
        strike: false,
        trailingNode: false,
        ...(plain ? { bold: false, italic: false, underline: false } : {}),
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: editorLocal }) => {
      const content = editorLocal.getJSON() as LeaseNode;
      onChange(documentText(content), content);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  return (
    <div className="lease-rich-editor">
      <div
        aria-label={`${label} formatting`}
        className="editor-tools"
        role="toolbar"
      >
        {!plain && (
          <>
            <Button
              aria-pressed={editor?.isActive("bold") ?? false}
              disabled={!editor || disabled}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              type="button"
            >
              Bold
            </Button>
            <Button
              aria-pressed={editor?.isActive("italic") ?? false}
              disabled={!editor || disabled}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              type="button"
            >
              Italic
            </Button>
            <Button
              disabled={!editor || disabled}
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
              type="button"
            >
              Heading
            </Button>
          </>
        )}
        <Button
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          type="button"
        >
          Bullets
        </Button>
        <Button
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          type="button"
        >
          Numbered list
        </Button>
        <Button
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().undo().run()}
          type="button"
        >
          Undo
        </Button>
        <Button
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().redo().run()}
          type="button"
        >
          Redo
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
export function LeaseDocumentPreview({ document }: { document: LeaseNode }) {
  /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
  function render(n: LeaseNode, key: number): ReactNode {
    const children = n.content?.map(render);
    if (n.type === "text") {
      let text: ReactNode = n.text;
      for (const mark of n.marks ?? []) {
        const resolveResult1 = () => {
          if (mark.type === "bold") {
            return <strong>{text}</strong>;
          }
          if (mark.type === "italic") {
            return <em>{text}</em>;
          }
          return <u>{text}</u>;
        };
        text = resolveResult1();
      }
      return <span key={key}>{text}</span>;
    }
    if (n.type === "heading") {
      return n.attrs?.level === 3 ? (
        <h3 key={key}>{children}</h3>
      ) : (
        <h2 key={key}>{children}</h2>
      );
    }
    if (n.type === "bulletList") {
      return <ul key={key}>{children}</ul>;
    }
    if (n.type === "orderedList") {
      return (
        <ol key={key} start={n.attrs?.start}>
          {children}
        </ol>
      );
    }
    if (n.type === "listItem") {
      return <li key={key}>{children}</li>;
    }
    if (n.type === "hardBreak") {
      return <br key={key} />;
    }
    if (n.type === "paragraph") {
      return <p key={key}>{children?.length ? children : <br />}</p>;
    }
    return <div key={key}>{children}</div>;
  }
  return (
    <article aria-label="Lease draft preview" className="lease-document">
      {render(document, 0)}
    </article>
  );
}
