import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Mention from "@tiptap/extension-mention";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { getDocForEditor, toPlainText, getPreviewText } from "./richTextUtils";

interface RichTextRendererProps {
  value: string | null | undefined;
  className?: string;
  "data-testid"?: string;
}

export function RichTextRenderer({
  value,
  className,
  "data-testid": testId,
}: RichTextRendererProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TextAlign.configure({
        types: ["paragraph", "heading"],
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
      }),
    ],
    content: getDocForEditor(value),
    editable: false,
  });

  useEffect(() => {
    if (editor && value !== undefined) {
      editor.commands.setContent(getDocForEditor(value));
    }
  }, [editor, value]);

  if (!value || toPlainText(value).trim() === "") {
    return null;
  }

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "[&_.ProseMirror]:focus:outline-none",
        "[&_.ProseMirror_p]:my-1",
        "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-4",
        "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-4",
        "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
        "[&_.ProseMirror_.mention]:bg-primary/20 [&_.ProseMirror_.mention]:text-primary [&_.ProseMirror_.mention]:rounded [&_.ProseMirror_.mention]:px-1",
        className
      )}
      data-testid={testId}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

interface RichTextPreviewProps {
  value: string | null | undefined;
  maxLength?: number;
  className?: string;
  "data-testid"?: string;
}

export function RichTextPreview({
  value,
  maxLength = 100,
  className,
  "data-testid": testId,
}: RichTextPreviewProps) {
  const preview = getPreviewText(value, maxLength);

  if (!preview) {
    return null;
  }

  return (
    <span className={cn("text-muted-foreground", className)} data-testid={testId}>
      {preview}
    </span>
  );
}

export default RichTextRenderer;
