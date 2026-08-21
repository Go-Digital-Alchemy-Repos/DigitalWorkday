import { describe, expect, it } from "vitest";

import {
  appendRichTextValue,
  isRichTextContentEmpty,
  toPlainText,
} from "./richTextUtils";

describe("support rich-text composition", () => {
  it("appends legacy canned-reply text without losing existing formatting", () => {
    const formattedReply = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Existing reply" },
          ],
        },
      ],
    });

    const combined = appendRichTextValue(formattedReply, "Canned reply");
    const combinedDoc = JSON.parse(combined);

    expect(toPlainText(combined)).toContain("Existing reply");
    expect(toPlainText(combined)).toContain("Canned reply");
    expect(combinedDoc.content[0].content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("keeps an empty rich-text document from becoming a sendable reply", () => {
    const emptyDocument = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    expect(isRichTextContentEmpty(emptyDocument)).toBe(true);
  });
});
