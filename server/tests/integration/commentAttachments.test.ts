import { describe, it, expect } from "vitest";
import {
  extractAttachmentIdsFromBody,
  embedAttachmentIdsInBody,
  toAttachmentMeta,
} from "../../utils/commentAttachments";

describe("Comment Attachments — Unit Tests", () => {
  describe("extractAttachmentIdsFromBody", () => {
    it("returns empty array for plain text body", () => {
      const ids = extractAttachmentIdsFromBody("Hello world");
      expect(ids).toEqual([]);
    });

    it("returns empty array for JSON body without attachmentIds", () => {
      const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual([]);
    });

    it("extracts attachmentIds from JSON body", () => {
      const body = JSON.stringify({
        type: "doc",
        content: [],
        attachmentIds: ["id-1", "id-2"],
      });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual(["id-1", "id-2"]);
    });

    it("filters out non-string values from attachmentIds", () => {
      const body = JSON.stringify({
        type: "doc",
        content: [],
        attachmentIds: ["id-1", 42, null, "", "id-2"],
      });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual(["id-1", "id-2"]);
    });
  });

  describe("embedAttachmentIdsInBody", () => {
    it("embeds attachmentIds into JSON body", () => {
      const body = JSON.stringify({ type: "doc", content: [] });
      const result = embedAttachmentIdsInBody(body, ["att-1", "att-2"]);
      const parsed = JSON.parse(result);
      expect(parsed.attachmentIds).toEqual(["att-1", "att-2"]);
      expect(parsed.type).toBe("doc");
    });

    it("returns original body when attachmentIds is empty", () => {
      const body = JSON.stringify({ type: "doc", content: [] });
      const result = embedAttachmentIdsInBody(body, []);
      expect(result).toBe(body);
    });

    it("returns original body if body is not valid JSON", () => {
      const body = "not json";
      const result = embedAttachmentIdsInBody(body, ["att-1"]);
      expect(result).toBe(body);
    });
  });

  describe("toAttachmentMeta", () => {
    it("maps TaskAttachment to CommentAttachmentMeta", () => {
      const attachment = {
        id: "att-1",
        taskId: "task-1",
        projectId: "proj-1",
        uploadedByUserId: "user-1",
        originalFileName: "report.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 12345,
        storageKey: "project-attachments/proj-1/tasks/task-1/att-1-report.pdf",
        uploadStatus: "complete",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2025-01-01T00:00:00Z"),
      };

      const meta = toAttachmentMeta(attachment);
      expect(meta).toEqual({
        id: "att-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 12345,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      });
    });
  });

  describe("Cross-tenant validation logic", () => {
    it("should filter out attachments from wrong task", () => {
      const validAttachments = [
        { id: "att-1", taskId: "task-1", projectId: "proj-1", uploadedByUserId: "u1", originalFileName: "f1.pdf", mimeType: "application/pdf", fileSizeBytes: 100, storageKey: "k1", uploadStatus: "complete", createdAt: new Date(), updatedAt: new Date() },
        { id: "att-2", taskId: "task-2", projectId: "proj-1", uploadedByUserId: "u1", originalFileName: "f2.pdf", mimeType: "application/pdf", fileSizeBytes: 200, storageKey: "k2", uploadStatus: "complete", createdAt: new Date(), updatedAt: new Date() },
      ];

      const currentTaskId = "task-1";
      const filteredIds = validAttachments
        .filter((a) => a.taskId === currentTaskId && a.uploadStatus === "complete")
        .map((a) => a.id);

      expect(filteredIds).toEqual(["att-1"]);
      expect(filteredIds).not.toContain("att-2");
    });

    it("should filter out pending/incomplete attachments", () => {
      const attachments = [
        { id: "att-1", taskId: "task-1", projectId: "proj-1", uploadedByUserId: "u1", originalFileName: "f1.pdf", mimeType: "application/pdf", fileSizeBytes: 100, storageKey: "k1", uploadStatus: "complete", createdAt: new Date(), updatedAt: new Date() },
        { id: "att-2", taskId: "task-1", projectId: "proj-1", uploadedByUserId: "u1", originalFileName: "f2.pdf", mimeType: "application/pdf", fileSizeBytes: 200, storageKey: "k2", uploadStatus: "pending", createdAt: new Date(), updatedAt: new Date() },
      ];

      const completedIds = attachments
        .filter((a) => a.uploadStatus === "complete")
        .map(toAttachmentMeta);

      expect(completedIds).toHaveLength(1);
      expect(completedIds[0].id).toBe("att-1");
    });
  });
});

describe("Blocked Extensions Guard", () => {
  it("should identify dangerous extensions", async () => {
    const { isBlockedExtension } = await import("../../s3");
    expect(isBlockedExtension("virus.exe")).toBe(true);
    expect(isBlockedExtension("script.bat")).toBe(true);
    expect(isBlockedExtension("installer.msi")).toBe(true);
    expect(isBlockedExtension("shell.sh")).toBe(true);
    expect(isBlockedExtension("disk.dmg")).toBe(true);
    expect(isBlockedExtension("app.apk")).toBe(true);
  });

  it("should allow safe business file extensions", async () => {
    const { isBlockedExtension } = await import("../../s3");
    expect(isBlockedExtension("report.pdf")).toBe(false);
    expect(isBlockedExtension("spreadsheet.xlsx")).toBe(false);
    expect(isBlockedExtension("document.docx")).toBe(false);
    expect(isBlockedExtension("image.png")).toBe(false);
    expect(isBlockedExtension("data.csv")).toBe(false);
    expect(isBlockedExtension("archive.zip")).toBe(false);
  });
});
