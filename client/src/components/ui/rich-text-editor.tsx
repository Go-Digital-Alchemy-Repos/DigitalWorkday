import { RichTextEditor as UnifiedRichTextEditor } from "@/components/richtext/RichTextEditor";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import { isValidTipTapDoc } from "@/components/richtext/richTextUtils";

export { UnifiedRichTextEditor as RichTextEditor };

interface RichTextViewerProps {
  content: string | Record<string, unknown> | null | undefined;
  className?: string;
}

export function RichTextViewer({ content, className }: RichTextViewerProps) {
  if (!content) return null;

  if (typeof content === "object" && isValidTipTapDoc(content)) {
    return <RichTextRenderer value={JSON.stringify(content)} className={className} />;
  }

  if (typeof content === "string") {
    return <RichTextRenderer value={content} className={className} />;
  }

  return <RichTextRenderer value={JSON.stringify(content)} className={className} />;
}
