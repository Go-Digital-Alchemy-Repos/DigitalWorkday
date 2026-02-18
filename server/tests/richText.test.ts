import { describe, it, expect } from "vitest";
import { isProseMirrorDoc, richTextToPlainText, richTextToPreview, renderRichText } from "../../client/src/lib/richtext/richText";

describe("isProseMirrorDoc", () => {
  it("detects a ProseMirror JSON object", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
    expect(isProseMirrorDoc(doc)).toBe(true);
  });

  it("detects a ProseMirror JSON string", () => {
    const str = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    expect(isProseMirrorDoc(str)).toBe(true);
  });

  it("rejects plain text", () => {
    expect(isProseMirrorDoc("hello world")).toBe(false);
  });

  it("rejects HTML string", () => {
    expect(isProseMirrorDoc("<p>hello</p>")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isProseMirrorDoc(null)).toBe(false);
    expect(isProseMirrorDoc(undefined)).toBe(false);
  });

  it("rejects object without type:doc", () => {
    expect(isProseMirrorDoc({ type: "paragraph", content: [] })).toBe(false);
  });

  it("rejects invalid JSON string", () => {
    expect(isProseMirrorDoc("{invalid json}")).toBe(false);
  });
});

describe("richTextToPlainText", () => {
  it("extracts text from ProseMirror JSON string", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
      ],
    });
    expect(richTextToPlainText(doc)).toBe("Hello world\nSecond line");
  });

  it("strips HTML tags", () => {
    expect(richTextToPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("returns plain text as-is", () => {
    expect(richTextToPlainText("Just a plain string")).toBe("Just a plain string");
  });

  it("returns empty string for null/undefined", () => {
    expect(richTextToPlainText(null)).toBe("");
    expect(richTextToPlainText(undefined)).toBe("");
    expect(richTextToPlainText("")).toBe("");
  });

  it("handles mention nodes", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hey " },
            { type: "mention", attrs: { id: "user-1", label: "Alice" } },
            { type: "text", text: " check this" },
          ],
        },
      ],
    });
    expect(richTextToPlainText(doc)).toBe("Hey @Alice check this");
  });

  it("handles empty ProseMirror doc", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    expect(richTextToPlainText(doc)).toBe("");
  });

  it("extracts text from ProseMirror JSON object (not string)", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Object input" }] },
      ],
    };
    expect(richTextToPlainText(doc as any)).toBe("Object input");
  });

  it("handles non-doc object by stringifying", () => {
    const obj = { foo: "bar" };
    expect(richTextToPlainText(obj as any)).toBe('{"foo":"bar"}');
  });
});

describe("richTextToPreview", () => {
  it("truncates long text with ellipsis", () => {
    const longText = "A".repeat(200);
    const preview = richTextToPreview(longText, 50);
    expect(preview.length).toBeLessThanOrEqual(53);
    expect(preview).toMatch(/\.\.\.$/);
  });

  it("collapses newlines to spaces", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line 2" }] },
      ],
    });
    expect(richTextToPreview(doc, 100)).toBe("Line 1 Line 2");
  });

  it("returns empty for null", () => {
    expect(richTextToPreview(null)).toBe("");
  });
});

describe("renderRichText", () => {
  it("classifies ProseMirror JSON string as prosemirror", () => {
    const str = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    const result = renderRichText(str);
    expect(result.type).toBe("prosemirror");
    expect(result.doc).toBeDefined();
    expect(result.doc!.type).toBe("doc");
  });

  it("classifies HTML as html", () => {
    const result = renderRichText("<p>Hello</p>");
    expect(result.type).toBe("html");
    expect(result.content).toBe("<p>Hello</p>");
  });

  it("classifies plain text as text", () => {
    const result = renderRichText("Just plain text");
    expect(result.type).toBe("text");
    expect(result.content).toBe("Just plain text");
  });

  it("returns text type for null", () => {
    const result = renderRichText(null);
    expect(result.type).toBe("text");
    expect(result.content).toBe("");
  });

  it("returns text type for empty string", () => {
    const result = renderRichText("");
    expect(result.type).toBe("text");
    expect(result.content).toBe("");
  });

  it("handles malformed JSON gracefully as text", () => {
    const result = renderRichText("{not valid json");
    expect(result.type).toBe("text");
    expect(result.content).toBe("{not valid json");
  });

  it("classifies ProseMirror JSON object as prosemirror", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };
    const result = renderRichText(doc as any);
    expect(result.type).toBe("prosemirror");
    expect(result.doc).toBeDefined();
    expect(result.doc!.type).toBe("doc");
  });
});
