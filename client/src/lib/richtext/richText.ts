type JSONContent = { type: string; content?: JSONContent[]; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

export function isProseMirrorDoc(value: unknown): value is JSONContent {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{")) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return (
        typeof parsed === "object" &&
        parsed !== null &&
        parsed.type === "doc" &&
        Array.isArray(parsed.content)
      );
    } catch {
      return false;
    }
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return obj.type === "doc" && Array.isArray(obj.content);
  }

  return false;
}

function isHtml(value: string): boolean {
  const t = value.trim();
  return /^<(?:p|div|span|br|ul|ol|li|strong|em|a |h[1-6]|blockquote|pre|code|table|thead|tbody|tr|td|th)\b/i.test(t);
}

function extractTextFromNode(node: JSONContent): string {
  if (node.type === "text" && node.text) return node.text;
  if (node.type === "mention" && node.attrs) {
    const label = node.attrs.label || node.attrs.id || "";
    return `@${label}`;
  }
  if (node.type === "hardBreak") return "\n";
  if (!node.content || !Array.isArray(node.content)) return "";
  const childTexts = node.content.map((child) => extractTextFromNode(child));
  if (node.type === "doc") {
    return childTexts.join("\n");
  }
  return childTexts.join("");
}

function htmlToPlainText(html: string): string {
  if (typeof document !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
}

function normalizeToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

export function richTextToPlainText(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object" && isProseMirrorDoc(value)) {
    return extractTextFromNode(value as JSONContent).replace(/\n{3,}/g, "\n\n").trim();
  }

  const str = normalizeToString(value);
  if (!str || str.trim() === "") return "";

  if (str.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(str);
      if (isProseMirrorDoc(parsed)) {
        return extractTextFromNode(parsed).replace(/\n{3,}/g, "\n\n").trim();
      }
    } catch {}
  }

  if (isHtml(str)) {
    return htmlToPlainText(str).trim();
  }

  return str;
}

export function richTextToPreview(
  value: unknown,
  maxLength: number = 100
): string {
  const text = richTextToPlainText(value);
  const single = text.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
  if (single.length <= maxLength) return single;
  return single.slice(0, maxLength).trim() + "...";
}

export function renderRichText(value: unknown): {
  type: "prosemirror" | "html" | "text";
  content: string;
  doc?: JSONContent;
} {
  if (value === null || value === undefined) {
    return { type: "text", content: "" };
  }

  if (typeof value === "object" && isProseMirrorDoc(value)) {
    const content = JSON.stringify(value);
    return { type: "prosemirror", content, doc: value as JSONContent };
  }

  const str = normalizeToString(value);
  if (!str || str.trim() === "") {
    return { type: "text", content: "" };
  }

  if (str.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(str);
      if (isProseMirrorDoc(parsed)) {
        return { type: "prosemirror", content: str, doc: parsed };
      }
    } catch {}
  }

  if (isHtml(str)) {
    return { type: "html", content: str };
  }

  return { type: "text", content: str };
}
