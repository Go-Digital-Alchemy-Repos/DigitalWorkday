import { describe, it, expect } from "vitest";
import {
  parseRichTextValue,
  toPlainText,
  getPreviewText,
  getDocForEditor,
  isValidTipTapDoc,
  isHtmlString,
  truncateText,
  wrapPlainTextAsDoc,
} from "../../client/src/components/richtext/richTextUtils";

const TIPTAP_DOC_OBJ = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { textAlign: null },
      content: [
        {
          type: "text",
          text: "This project is to keep track of bugs we come across while piloting the DigitalWorkday App.",
        },
      ],
    },
  ],
};

const TIPTAP_DOC_STRING = JSON.stringify(TIPTAP_DOC_OBJ);

const MULTI_PARAGRAPH_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "First paragraph." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Second paragraph." }],
    },
  ],
};

describe("richTextUtils", () => {
  describe("isValidTipTapDoc", () => {
    it("returns true for valid TipTap doc object", () => {
      expect(isValidTipTapDoc(TIPTAP_DOC_OBJ)).toBe(true);
    });

    it("returns false for plain string", () => {
      expect(isValidTipTapDoc("hello")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isValidTipTapDoc(null)).toBe(false);
    });

    it("returns false for object without doc type", () => {
      expect(isValidTipTapDoc({ type: "paragraph", content: [] })).toBe(false);
    });
  });

  describe("parseRichTextValue", () => {
    it("parses JSON string as TipTap doc", () => {
      const result = parseRichTextValue(TIPTAP_DOC_STRING);
      expect(result.type).toBe("tiptap");
      expect(result.doc).toEqual(TIPTAP_DOC_OBJ);
    });

    it("treats plain text as text type", () => {
      const result = parseRichTextValue("Hello world");
      expect(result.type).toBe("text");
      expect(result.text).toBe("Hello world");
    });

    it("treats HTML as text type", () => {
      const result = parseRichTextValue("<p>Hello world</p>");
      expect(result.type).toBe("text");
      expect(result.text).toBe("<p>Hello world</p>");
    });

    it("treats empty/null as text with empty string", () => {
      expect(parseRichTextValue(null)).toEqual({ type: "text", text: "" });
      expect(parseRichTextValue(undefined)).toEqual({ type: "text", text: "" });
      expect(parseRichTextValue("")).toEqual({ type: "text", text: "" });
    });

    it("treats invalid JSON as plain text", () => {
      const result = parseRichTextValue("{broken json");
      expect(result.type).toBe("text");
      expect(result.text).toBe("{broken json");
    });
  });

  describe("toPlainText", () => {
    it("extracts text from TipTap JSON string", () => {
      const result = toPlainText(TIPTAP_DOC_STRING);
      expect(result).toBe(
        "This project is to keep track of bugs we come across while piloting the DigitalWorkday App."
      );
    });

    it("extracts text from multi-paragraph doc", () => {
      const result = toPlainText(JSON.stringify(MULTI_PARAGRAPH_DOC));
      expect(result).toBe("First paragraph.\nSecond paragraph.");
    });

    it("returns plain text as-is", () => {
      expect(toPlainText("Hello world")).toBe("Hello world");
    });

    it("returns empty string for null/undefined", () => {
      expect(toPlainText(null)).toBe("");
      expect(toPlainText(undefined)).toBe("");
    });

    it("returns HTML as-is (since parseRichTextValue treats it as text)", () => {
      expect(toPlainText("<p>Hello</p>")).toBe("<p>Hello</p>");
    });
  });

  describe("getPreviewText", () => {
    it("converts TipTap JSON to truncated plain text", () => {
      const result = getPreviewText(TIPTAP_DOC_STRING, 50);
      expect(result).toBe("This project is to keep track of bugs we come acro...");
      expect(result).not.toContain("{");
      expect(result).not.toContain('"type"');
    });

    it("returns full text when under limit", () => {
      const result = getPreviewText("Short text", 100);
      expect(result).toBe("Short text");
    });

    it("replaces newlines with spaces in preview", () => {
      const result = getPreviewText(JSON.stringify(MULTI_PARAGRAPH_DOC), 200);
      expect(result).toBe("First paragraph. Second paragraph.");
    });

    it("returns empty string for null", () => {
      expect(getPreviewText(null)).toBe("");
    });
  });

  describe("getDocForEditor", () => {
    it("parses JSON string to TipTap doc", () => {
      const result = getDocForEditor(TIPTAP_DOC_STRING);
      expect(result).toEqual(TIPTAP_DOC_OBJ);
    });

    it("wraps plain text as doc", () => {
      const result = getDocForEditor("Hello world");
      expect(result.type).toBe("doc");
      expect(result.content).toHaveLength(1);
      expect(result.content![0].type).toBe("paragraph");
      expect(result.content![0].content![0].text).toBe("Hello world");
    });

    it("wraps null as empty doc", () => {
      const result = getDocForEditor(null);
      expect(result.type).toBe("doc");
      expect(result.content).toHaveLength(1);
      expect(result.content![0].type).toBe("paragraph");
    });
  });

  describe("isHtmlString", () => {
    it("detects HTML strings", () => {
      expect(isHtmlString("<p>hello</p>")).toBe(true);
      expect(isHtmlString("<div>test</div>")).toBe(true);
      expect(isHtmlString("<strong>bold</strong>")).toBe(true);
      expect(isHtmlString("<a href='#'>link</a>")).toBe(true);
    });

    it("rejects non-HTML strings", () => {
      expect(isHtmlString("plain text")).toBe(false);
      expect(isHtmlString('{"type":"doc"}')).toBe(false);
    });
  });

  describe("truncateText", () => {
    it("truncates long text with ellipsis", () => {
      expect(truncateText("Hello world this is long", 10)).toBe("Hello worl...");
    });

    it("returns short text unchanged", () => {
      expect(truncateText("Short", 100)).toBe("Short");
    });
  });

  describe("wrapPlainTextAsDoc", () => {
    it("wraps multi-line text into paragraphs", () => {
      const result = wrapPlainTextAsDoc("Line 1\nLine 2");
      expect(result.type).toBe("doc");
      expect(result.content).toHaveLength(2);
    });

    it("handles empty text", () => {
      const result = wrapPlainTextAsDoc("");
      expect(result.type).toBe("doc");
      expect(result.content).toHaveLength(1);
      expect(result.content![0].type).toBe("paragraph");
    });
  });
});
