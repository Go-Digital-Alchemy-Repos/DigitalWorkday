import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AttachmentPicker,
  MessageAttachments,
  type CommunicationAttachment,
} from "@/components/communication-attachments";

describe("communication attachment UI", () => {
  it("offers a multi-file picker for images and business documents", () => {
    const markup = renderToStaticMarkup(
      <AttachmentPicker files={[]} onFilesChange={() => undefined} />,
    );

    expect(markup).toContain('type="file"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain(".pdf");
    expect(markup).toContain(".docx");
    expect(markup).toContain(".xlsx");
    expect(markup).toContain("Attach files");
    expect(markup).toContain("25 MB each");
  });

  it("renders attachment metadata without embedding private object URLs", () => {
    const attachments: CommunicationAttachment[] = [{
      id: "attachment-1",
      fileName: "project brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2 * 1024 * 1024,
    }];
    const markup = renderToStaticMarkup(
      <MessageAttachments
        attachments={attachments}
        downloadPath={(id) => `/api/v1/portal/support/tickets/ticket-1/attachments/${id}/download`}
      />,
    );

    expect(markup).toContain("project brief.pdf");
    expect(markup).toContain("2.0 MB");
    expect(markup).toContain("button-download-attachment-attachment-1");
    expect(markup).not.toContain("storageKey");
    expect(markup).not.toContain("https://");
  });
});
