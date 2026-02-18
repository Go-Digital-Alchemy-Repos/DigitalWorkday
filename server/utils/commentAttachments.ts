import type { TaskAttachment } from "@shared/schema";
import type { IStorage } from "../storage";

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

export async function enrichCommentsWithAttachments(
  comments: any[],
  storageInstance: IStorage
): Promise<any[]> {
  const allAttachmentIds: string[] = [];
  const commentAttachmentMap = new Map<number, string[]>();
  for (let i = 0; i < comments.length; i++) {
    const ids = extractAttachmentIdsFromBody(comments[i].body);
    if (ids.length > 0) {
      commentAttachmentMap.set(i, ids);
      allAttachmentIds.push(...ids);
    }
  }
  if (allAttachmentIds.length === 0) {
    return comments.map((c: any) => ({ ...c, attachments: [] }));
  }
  const uniqueIds = [...new Set(allAttachmentIds)];
  const attachments = await storageInstance.getTaskAttachmentsByIds(uniqueIds);
  const attachmentMap = new Map(attachments.map((a) => [a.id, toAttachmentMeta(a)]));
  return comments.map((c: any, i: number) => {
    const ids = commentAttachmentMap.get(i) || [];
    return {
      ...c,
      attachments: ids.map((id) => attachmentMap.get(id)).filter(Boolean),
    };
  });
}
