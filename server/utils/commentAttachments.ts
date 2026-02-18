import type { TaskAttachment } from "@shared/schema";

export interface CommentAttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export function extractAttachmentIdsFromBody(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    if (parsed && Array.isArray(parsed.attachmentIds)) {
      return parsed.attachmentIds.filter((id: unknown) => typeof id === "string" && id.length > 0);
    }
  } catch {
  }
  return [];
}

export function embedAttachmentIdsInBody(body: string, attachmentIds: string[]): string {
  if (attachmentIds.length === 0) return body;
  try {
    const parsed = JSON.parse(body);
    parsed.attachmentIds = attachmentIds;
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

export function toAttachmentMeta(attachment: TaskAttachment): CommentAttachmentMeta {
  return {
    id: attachment.id,
    filename: attachment.originalFileName,
    mimeType: attachment.mimeType,
    size: attachment.fileSizeBytes,
    createdAt: attachment.createdAt,
  };
}
