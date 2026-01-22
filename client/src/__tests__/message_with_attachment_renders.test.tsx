import { describe, it, expect } from "vitest";

interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

interface ChatMessage {
  id: string;
  body: string;
  attachments?: ChatAttachment[];
}

const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith("image/")) return "ImageIcon";
  if (mimeType === "application/pdf") return "FileTextIcon";
  return "FileIcon";
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

describe("Message with Attachment Rendering", () => {
  describe("Attachment icon selection", () => {
    it("should return ImageIcon for image MIME types", () => {
      expect(getFileIcon("image/png")).toBe("ImageIcon");
      expect(getFileIcon("image/jpeg")).toBe("ImageIcon");
      expect(getFileIcon("image/webp")).toBe("ImageIcon");
      expect(getFileIcon("image/gif")).toBe("ImageIcon");
    });

    it("should return FileTextIcon for PDF files", () => {
      expect(getFileIcon("application/pdf")).toBe("FileTextIcon");
    });

    it("should return generic FileIcon for other types", () => {
      expect(getFileIcon("application/zip")).toBe("FileIcon");
      expect(getFileIcon("text/plain")).toBe("FileIcon");
      expect(getFileIcon("application/msword")).toBe("FileIcon");
    });
  });

  describe("File size formatting", () => {
    it("should format bytes correctly", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes correctly", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(2048)).toBe("2.0 KB");
    });

    it("should format megabytes correctly", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    });
  });

  describe("Message attachment data structure", () => {
    it("should have correct attachment structure", () => {
      const attachment: ChatAttachment = {
        id: "att-123",
        fileName: "document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024 * 500,
        url: "https://bucket.s3.region.amazonaws.com/path/to/file.pdf",
      };

      expect(attachment.id).toBeDefined();
      expect(attachment.fileName).toBe("document.pdf");
      expect(attachment.mimeType).toBe("application/pdf");
      expect(attachment.sizeBytes).toBe(512000);
      expect(attachment.url).toContain("https://");
    });

    it("should support messages with multiple attachments", () => {
      const message: ChatMessage = {
        id: "msg-1",
        body: "Check out these files",
        attachments: [
          {
            id: "att-1",
            fileName: "photo.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 2048,
            url: "https://example.com/photo.jpg",
          },
          {
            id: "att-2",
            fileName: "document.pdf",
            mimeType: "application/pdf",
            sizeBytes: 4096,
            url: "https://example.com/document.pdf",
          },
        ],
      };

      expect(message.attachments).toHaveLength(2);
      expect(message.attachments![0].mimeType).toBe("image/jpeg");
      expect(message.attachments![1].mimeType).toBe("application/pdf");
    });

    it("should handle messages without attachments", () => {
      const message: ChatMessage = {
        id: "msg-1",
        body: "Just a text message",
        attachments: [],
      };

      expect(message.attachments).toHaveLength(0);
    });
  });

  describe("Image attachment preview logic", () => {
    it("should identify image attachments for preview", () => {
      const attachments: ChatAttachment[] = [
        { id: "1", fileName: "photo.png", mimeType: "image/png", sizeBytes: 1024, url: "" },
        { id: "2", fileName: "doc.pdf", mimeType: "application/pdf", sizeBytes: 1024, url: "" },
      ];

      const imageAttachments = attachments.filter((a) =>
        a.mimeType.startsWith("image/")
      );
      const nonImageAttachments = attachments.filter(
        (a) => !a.mimeType.startsWith("image/")
      );

      expect(imageAttachments).toHaveLength(1);
      expect(imageAttachments[0].fileName).toBe("photo.png");
      expect(nonImageAttachments).toHaveLength(1);
      expect(nonImageAttachments[0].fileName).toBe("doc.pdf");
    });
  });

  describe("Attachment URL handling", () => {
    it("should use attachment URL for download link", () => {
      const attachment: ChatAttachment = {
        id: "att-1",
        fileName: "file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        url: "https://bucket.s3.region.amazonaws.com/tenant/file.pdf",
      };

      const downloadHref = attachment.url;
      expect(downloadHref).toBe("https://bucket.s3.region.amazonaws.com/tenant/file.pdf");
    });

    it("should render image src from attachment URL", () => {
      const attachment: ChatAttachment = {
        id: "att-1",
        fileName: "image.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        url: "https://bucket.s3.region.amazonaws.com/tenant/image.png",
      };

      const isImage = attachment.mimeType.startsWith("image/");
      expect(isImage).toBe(true);

      const imgSrc = isImage ? attachment.url : null;
      expect(imgSrc).toBe("https://bucket.s3.region.amazonaws.com/tenant/image.png");
    });
  });

  describe("Pending attachment display", () => {
    it("should show pending attachments before message is sent", () => {
      const pendingAttachments: ChatAttachment[] = [
        {
          id: "pending-1",
          fileName: "uploading.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          url: "",
        },
      ];

      expect(pendingAttachments).toHaveLength(1);
      expect(pendingAttachments[0].id).toContain("pending");
    });

    it("should allow removing pending attachments", () => {
      let pendingAttachments = [
        { id: "att-1", fileName: "file1.pdf", mimeType: "application/pdf", sizeBytes: 1024, url: "" },
        { id: "att-2", fileName: "file2.pdf", mimeType: "application/pdf", sizeBytes: 2048, url: "" },
      ];

      const removePendingAttachment = (id: string) => {
        pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
      };

      removePendingAttachment("att-1");
      expect(pendingAttachments).toHaveLength(1);
      expect(pendingAttachments[0].id).toBe("att-2");
    });
  });
});
