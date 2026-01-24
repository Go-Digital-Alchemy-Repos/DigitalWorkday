import { z } from "zod";

const MAX_RICH_TEXT_LENGTH = 50000;

interface TipTapDoc {
  type: string;
  content?: unknown[];
}

function isValidTipTapDoc(value: unknown): value is TipTapDoc {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "doc" && (obj.content === undefined || Array.isArray(obj.content));
}

function looksLikeHtml(value: string): boolean {
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
    trimmed.startsWith("<a ") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html")
  );
}

export function validateRichTextValue(value: string | null | undefined): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: true };
  }

  if (value.length > MAX_RICH_TEXT_LENGTH) {
    return { valid: false, error: `Rich text exceeds maximum length of ${MAX_RICH_TEXT_LENGTH} characters.` };
  }

  if (looksLikeHtml(value)) {
    return { valid: false, error: "Rich text must be stored as TipTap JSON string, not HTML." };
  }

  if (value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (isValidTipTapDoc(parsed)) {
        return { valid: true };
      }
      return { valid: false, error: "Rich text JSON must be a valid TipTap document with type 'doc'." };
    } catch {
      return { valid: false, error: "Rich text appears to be JSON but is malformed." };
    }
  }

  return { valid: false, error: "Rich text must be stored as TipTap JSON string. Plain text is not accepted for new content." };
}

export function validateRichTextValueWithLegacySupport(value: string | null | undefined): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: true };
  }

  if (value.length > MAX_RICH_TEXT_LENGTH) {
    return { valid: false, error: `Rich text exceeds maximum length of ${MAX_RICH_TEXT_LENGTH} characters.` };
  }

  if (looksLikeHtml(value)) {
    return { valid: false, error: "Rich text must be stored as TipTap JSON string, not HTML." };
  }

  if (value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (isValidTipTapDoc(parsed)) {
        return { valid: true };
      }
    } catch {
    }
  }

  return { valid: true };
}

export const richTextSchema = z.string().max(MAX_RICH_TEXT_LENGTH).refine(
  (value) => {
    const result = validateRichTextValue(value);
    return result.valid;
  },
  (value) => {
    const result = validateRichTextValue(value);
    return { message: result.error || "Invalid rich text format." };
  }
);

export const optionalRichTextSchema = z.string().max(MAX_RICH_TEXT_LENGTH).optional().nullable().refine(
  (value) => {
    if (!value) return true;
    const result = validateRichTextValue(value);
    return result.valid;
  },
  (value) => {
    const result = validateRichTextValue(value);
    return { message: result.error || "Invalid rich text format." };
  }
);

export const legacyRichTextSchema = z.string().max(MAX_RICH_TEXT_LENGTH).refine(
  (value) => {
    const result = validateRichTextValueWithLegacySupport(value);
    return result.valid;
  },
  (value) => {
    const result = validateRichTextValueWithLegacySupport(value);
    return { message: result.error || "Invalid rich text format." };
  }
);

export const optionalLegacyRichTextSchema = z.string().max(MAX_RICH_TEXT_LENGTH).optional().nullable().refine(
  (value) => {
    if (!value) return true;
    const result = validateRichTextValueWithLegacySupport(value);
    return result.valid;
  },
  (value) => {
    const result = validateRichTextValueWithLegacySupport(value);
    return { message: result.error || "Invalid rich text format." };
  }
);
