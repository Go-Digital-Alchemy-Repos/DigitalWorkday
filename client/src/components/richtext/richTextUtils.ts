import type { JSONContent } from "@tiptap/react";

export type RichTextType = "tiptap" | "text";

export interface ParsedRichText {
  type: RichTextType;
  doc?: JSONContent;
  text?: string;
}

export function isValidTipTapDoc(value: unknown): value is JSONContent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "doc" && Array.isArray(obj.content);
}

export function normalizeRichTextValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (isValidTipTapDoc(value)) {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function parseRichTextValue(value: unknown): ParsedRichText {
  if (value == null) {
    return { type: "text", text: "" };
  }

  if (isValidTipTapDoc(value)) {
    return { type: "tiptap", doc: value };
  }

  if (typeof value !== "string") {
    return { type: "text", text: normalizeRichTextValue(value) };
  }

  if (value.trim() === "") {
    return { type: "text", text: "" };
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("<") && (trimmed.startsWith("<p") || trimmed.startsWith("<div") || trimmed.startsWith("<span"))) {
    return { type: "text", text: trimmed };
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isValidTipTapDoc(parsed)) {
        return { type: "tiptap", doc: parsed };
      }
    } catch {
    }
  }

  return { type: "text", text: value };
}

export function toPlainText(value: unknown): string {
  const parsed = parseRichTextValue(value);

  if (parsed.type === "text") {
    return parsed.text || "";
  }

  if (parsed.type === "tiptap" && parsed.doc) {
    return extractTextFromDoc(parsed.doc);
  }

  return "";
}

export function isRichTextContentEmpty(value: unknown): boolean {
  const parsed = parseRichTextValue(value);

  if (parsed.type === "tiptap") {
    return toPlainText(value).trim() === "";
  }

  const text = parsed.text || "";
  if (isHtmlString(text)) {
    return text
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim() === "";
  }

  return text.trim() === "";
}

export function normalizeRichTextForStorage(value: unknown): string {
  if (isRichTextContentEmpty(value)) {
    return "";
  }

  return normalizeRichTextValue(value);
}

export function toEditablePlainText(value: unknown): string {
  const parsed = parseRichTextValue(value);

  if (parsed.type === "tiptap") {
    return toPlainText(value);
  }

  return parsed.text || "";
}

function extractTextFromDoc(node: JSONContent): string {
  if (node.type === "text" && node.text) {
    return node.text;
  }

  if (node.type === "mention" && node.attrs) {
    const attrs = node.attrs as Record<string, unknown>;
    const label = attrs.label || attrs.id || "";
    return label ? `@${String(label)}` : "";
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child) => extractTextFromDoc(child))
      .join(node.type === "paragraph" || node.type === "doc" ? "\n" : "");
  }

  return "";
}

export function wrapPlainTextAsDoc(text: string): JSONContent {
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
  }

  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  };
}

export function getDocForEditor(value: unknown): JSONContent {
  const parsed = parseRichTextValue(value);

  if (parsed.type === "tiptap" && parsed.doc) {
    return parsed.doc;
  }

  return wrapPlainTextAsDoc(parsed.text || "");
}

export function serializeDocToString(doc: JSONContent): string {
  return JSON.stringify(doc);
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

export function getPreviewText(value: unknown, maxLength: number = 100): string {
  const plainText = toPlainText(value);
  return truncateText(plainText.replace(/\n/g, " "), maxLength);
}

export function isHtmlString(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("<p") ||
    trimmed.startsWith("<div") ||
    trimmed.startsWith("<span") ||
    trimmed.startsWith("<br") ||
    trimmed.startsWith("<ul") ||
    trimmed.startsWith("<ol") ||
    trimmed.startsWith("<li") ||
    trimmed.startsWith("<strong") ||
    trimmed.startsWith("<em") ||
    trimmed.startsWith("<a ")
  );
}
