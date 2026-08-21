import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  createPresignedDownloadUrl: vi.fn(),
  deleteS3Object: vi.fn(),
  uploadToS3: vi.fn(),
  validateFile: vi.fn(),
}));

vi.mock("../s3", () => storageMocks);

import {
  createCommunicationAttachmentDownload,
  findCommunicationAttachment,
  uploadCommunicationAttachments,
  toPublicCommunicationAttachments,
} from "../services/communicationAttachments";

describe("communication attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.validateFile.mockReturnValue({ valid: true });
    storageMocks.createPresignedDownloadUrl.mockResolvedValue("https://downloads.example.test/file");
    storageMocks.uploadToS3.mockResolvedValue(undefined);
    storageMocks.deleteS3Object.mockResolvedValue(undefined);
  });

  it("never exposes the private storage key in message payloads", () => {
    expect(toPublicCommunicationAttachments([{
      id: "attachment-1",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "communication-attachments/tenant-1/private-key",
    }])).toEqual([{
      id: "attachment-1",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    }]);
  });

  it("finds an attachment only from the authorized parent message collection", () => {
    const expected = {
      id: "attachment-2",
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      storageKey: "communication-attachments/tenant-1/ticket/photo.png",
    };

    expect(findCommunicationAttachment([undefined, [], [expected]], "attachment-2")).toBe(expected);
    expect(findCommunicationAttachment([[expected]], "not-present")).toBeUndefined();
  });

  it("builds tenant-scoped keys and sanitizes filenames before upload", async () => {
    const [attachment] = await uploadCommunicationAttachments([{
      originalname: "../../Q3 plan.pdf",
      mimetype: "application/pdf",
      size: 4,
      buffer: Buffer.from("test"),
    }], {
      tenantId: "tenant/one",
      kind: "support-ticket",
      contextId: "ticket/one",
    });

    expect(attachment.fileName).toBe("Q3 plan.pdf");
    expect(attachment.storageKey).toMatch(/^communication-attachments\/tenant_one\/support-ticket\/ticket_one\//);
    expect(attachment.storageKey).not.toContain("..");
    expect(storageMocks.uploadToS3).toHaveBeenCalledWith(
      expect.any(Buffer),
      attachment.storageKey,
      "application/pdf",
      "tenant/one",
    );
  });

  it("cleans up earlier uploads when a later object upload fails", async () => {
    storageMocks.uploadToS3
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(uploadCommunicationAttachments([
      { originalname: "first.pdf", mimetype: "application/pdf", size: 1, buffer: Buffer.from("1") },
      { originalname: "second.pdf", mimetype: "application/pdf", size: 1, buffer: Buffer.from("2") },
    ], {
      tenantId: "tenant-1",
      kind: "client-message",
      contextId: "conversation-1",
    })).rejects.toThrow("storage unavailable");

    expect(storageMocks.deleteS3Object).toHaveBeenCalledTimes(1);
    expect(storageMocks.deleteS3Object).toHaveBeenCalledWith(
      expect.stringContaining("first.pdf"),
      "tenant-1",
    );
  });

  it("rejects more than ten files before writing to storage", async () => {
    const files = Array.from({ length: 11 }, (_, index) => ({
      originalname: `${index}.pdf`,
      mimetype: "application/pdf",
      size: 1,
      buffer: Buffer.from("x"),
    }));

    await expect(uploadCommunicationAttachments(files, {
      tenantId: "tenant-1",
      kind: "support-ticket",
      contextId: "ticket-1",
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(storageMocks.uploadToS3).not.toHaveBeenCalled();
  });

  it("creates short-lived downloads using the server-stored object metadata", async () => {
    const attachment = {
      id: "attachment-3",
      fileName: "financials.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 4096,
      storageKey: "communication-attachments/tenant-1/client-message/conversation-1/file.xlsx",
    };

    await expect(createCommunicationAttachmentDownload(attachment, "tenant-1")).resolves.toEqual({
      url: "https://downloads.example.test/file",
      fileName: "financials.xlsx",
    });
    expect(storageMocks.createPresignedDownloadUrl).toHaveBeenCalledWith(
      attachment.storageKey,
      "tenant-1",
      {
        contentDisposition: "attachment",
        contentType: attachment.mimeType,
        fileName: attachment.fileName,
      },
    );
  });
});
