import { describe, it, expect, vi } from "vitest";
import {
  embedAttachmentIdsInBody,
  extractAttachmentIdsFromBody,
  toAttachmentMeta,
  enrichCommentsWithAttachments,
} from "../utils/commentAttachments";
import type { TaskAttachment } from "@shared/schema";

function makeTipTapBody(text: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    ...extra,
  });
}

function makeFakeAttachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    id: overrides.id || "att-001",
    taskId: "task-001",
    projectId: "proj-001",
    tenantId: "tenant-001",
    originalFileName: overrides.originalFileName || "report.pdf",
    mimeType: overrides.mimeType || "application/pdf",
    fileSizeBytes: overrides.fileSizeBytes || 12345,
    storageKey: "uploads/task-001/report.pdf",
    uploadedByUserId: "user-001",
    status: "completed",
    createdAt: new Date("2026-01-15T10:00:00Z"),
    ...(overrides as any),
  } as unknown as TaskAttachment;
}

describe("Comment Attachments Utilities", () => {
  describe("embedAttachmentIdsInBody", () => {
    it("should embed attachment IDs into valid TipTap JSON body", () => {
      const body = makeTipTapBody("Hello world");
      const result = embedAttachmentIdsInBody(body, ["att-001", "att-002"]);
      const parsed = JSON.parse(result);
      expect(parsed.attachmentIds).toEqual(["att-001", "att-002"]);
      expect(parsed.type).toBe("doc");
      expect(parsed.content[0].content[0].text).toBe("Hello world");
    });

    it("should return body unchanged when attachmentIds is empty", () => {
      const body = makeTipTapBody("No attachments");
      const result = embedAttachmentIdsInBody(body, []);
      expect(result).toBe(body);
    });

    it("should return body unchanged for invalid JSON", () => {
      const body = "not json";
      const result = embedAttachmentIdsInBody(body, ["att-001"]);
      expect(result).toBe(body);
    });

    it("should overwrite existing attachmentIds", () => {
      const body = makeTipTapBody("Updated", { attachmentIds: ["old-id"] });
      const result = embedAttachmentIdsInBody(body, ["new-id"]);
      const parsed = JSON.parse(result);
      expect(parsed.attachmentIds).toEqual(["new-id"]);
    });
  });

  describe("extractAttachmentIdsFromBody", () => {
    it("should extract attachment IDs from body with attachmentIds", () => {
      const body = makeTipTapBody("With files", { attachmentIds: ["att-001", "att-002"] });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual(["att-001", "att-002"]);
    });

    it("should return empty array when no attachmentIds field", () => {
      const body = makeTipTapBody("Plain comment");
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual([]);
    });

    it("should return empty array for invalid JSON", () => {
      const ids = extractAttachmentIdsFromBody("not json");
      expect(ids).toEqual([]);
    });

    it("should filter out non-string and empty values", () => {
      const body = JSON.stringify({
        type: "doc",
        attachmentIds: ["valid-id", "", null, 123, "another-id"],
      });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual(["valid-id", "another-id"]);
    });

    it("should return empty array when attachmentIds is not an array", () => {
      const body = JSON.stringify({ type: "doc", attachmentIds: "not-an-array" });
      const ids = extractAttachmentIdsFromBody(body);
      expect(ids).toEqual([]);
    });
  });

  describe("toAttachmentMeta", () => {
    it("should map TaskAttachment to CommentAttachmentMeta", () => {
      const attachment = makeFakeAttachment({
        id: "att-999",
        originalFileName: "design.png",
        mimeType: "image/png",
        fileSizeBytes: 54321,
      });
      const meta = toAttachmentMeta(attachment);
      expect(meta).toEqual({
        id: "att-999",
        filename: "design.png",
        mimeType: "image/png",
        size: 54321,
        createdAt: attachment.createdAt,
      });
    });

    it("should not include storage keys or user IDs in output", () => {
      const attachment = makeFakeAttachment();
      const meta = toAttachmentMeta(attachment);
      expect(meta).not.toHaveProperty("storageKey");
      expect(meta).not.toHaveProperty("uploadedByUserId");
      expect(meta).not.toHaveProperty("taskId");
      expect(meta).not.toHaveProperty("projectId");
      expect(meta).not.toHaveProperty("tenantId");
    });
  });

  describe("enrichCommentsWithAttachments", () => {
    it("should enrich comments that have attachment IDs with metadata", async () => {
      const att1 = makeFakeAttachment({ id: "att-001", originalFileName: "doc.pdf" });
      const att2 = makeFakeAttachment({ id: "att-002", originalFileName: "img.png", mimeType: "image/png" });

      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn().mockResolvedValue([att1, att2]),
      } as any;

      const comments = [
        { id: "c1", body: makeTipTapBody("With files", { attachmentIds: ["att-001", "att-002"] }) },
        { id: "c2", body: makeTipTapBody("Plain comment") },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched).toHaveLength(2);
      expect(enriched[0].attachments).toHaveLength(2);
      expect(enriched[0].attachments[0].id).toBe("att-001");
      expect(enriched[0].attachments[1].id).toBe("att-002");
      expect(enriched[1].attachments).toEqual([]);
      expect(mockStorage.getTaskAttachmentsByIds).toHaveBeenCalledWith(["att-001", "att-002"]);
    });

    it("should return empty attachments array when no comments have attachments", async () => {
      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn(),
      } as any;

      const comments = [
        { id: "c1", body: makeTipTapBody("No attachments") },
        { id: "c2", body: makeTipTapBody("Also none") },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched[0].attachments).toEqual([]);
      expect(enriched[1].attachments).toEqual([]);
      expect(mockStorage.getTaskAttachmentsByIds).not.toHaveBeenCalled();
    });

    it("should deduplicate attachment IDs across multiple comments", async () => {
      const att1 = makeFakeAttachment({ id: "shared-att" });
      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn().mockResolvedValue([att1]),
      } as any;

      const comments = [
        { id: "c1", body: makeTipTapBody("First", { attachmentIds: ["shared-att"] }) },
        { id: "c2", body: makeTipTapBody("Second", { attachmentIds: ["shared-att"] }) },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched[0].attachments).toHaveLength(1);
      expect(enriched[1].attachments).toHaveLength(1);
      expect(mockStorage.getTaskAttachmentsByIds).toHaveBeenCalledWith(["shared-att"]);
    });

    it("should gracefully handle missing attachments (deleted from storage)", async () => {
      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn().mockResolvedValue([]),
      } as any;

      const comments = [
        { id: "c1", body: makeTipTapBody("Deleted att", { attachmentIds: ["deleted-att"] }) },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched[0].attachments).toEqual([]);
    });

    it("should preserve original comment fields in enriched output", async () => {
      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn().mockResolvedValue([]),
      } as any;

      const comments = [
        {
          id: "c1",
          body: makeTipTapBody("Hello"),
          userId: "user-001",
          taskId: "task-001",
          createdAt: new Date(),
          user: { id: "user-001", name: "Alice" },
        },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched[0].id).toBe("c1");
      expect(enriched[0].userId).toBe("user-001");
      expect(enriched[0].user.name).toBe("Alice");
      expect(enriched[0]).toHaveProperty("attachments");
    });
  });

  describe("roundtrip: embed → extract", () => {
    it("should roundtrip attachment IDs through embed and extract", () => {
      const ids = ["att-aaa", "att-bbb", "att-ccc"];
      const body = makeTipTapBody("Comment with files");
      const embedded = embedAttachmentIdsInBody(body, ids);
      const extracted = extractAttachmentIdsFromBody(embedded);
      expect(extracted).toEqual(ids);
    });
  });

  describe("tenant isolation (security)", () => {
    it("should only return attachments that exist in storage (tenant-scoped by storage layer)", async () => {
      const tenantAAttachment = makeFakeAttachment({ id: "tenant-a-att", tenantId: "tenant-a" as any });
      const mockStorage = {
        getTaskAttachmentsByIds: vi.fn().mockResolvedValue([tenantAAttachment]),
      } as any;

      const comments = [
        { id: "c1", body: makeTipTapBody("Cross-tenant attempt", { attachmentIds: ["tenant-a-att", "tenant-b-att"] }) },
      ];

      const enriched = await enrichCommentsWithAttachments(comments, mockStorage);
      expect(enriched[0].attachments).toHaveLength(1);
      expect(enriched[0].attachments[0].id).toBe("tenant-a-att");
    });
  });
});
