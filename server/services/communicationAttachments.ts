import crypto from "crypto";
import type { CommunicationAttachment } from "@shared/schema";
import {
  createPresignedDownloadUrl,
  deleteS3Object,
  uploadToS3,
  validateFile,
} from "../s3";
import { sanitizeFilename } from "../http/middleware/uploadGuards";
import { AppError } from "../lib/errors";

export const MAX_COMMUNICATION_ATTACHMENTS = 10;
export const MAX_COMMUNICATION_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type PublicCommunicationAttachment = Omit<CommunicationAttachment, "storageKey">;

type UploadedFile = {
  originalname?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
};

function sanitizeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

export function toPublicCommunicationAttachments(
  attachments: CommunicationAttachment[] | null | undefined,
): PublicCommunicationAttachment[] {
  return (attachments || []).map(({ storageKey: _storageKey, ...attachment }) => attachment);
}

export function findCommunicationAttachment(
  collections: Array<CommunicationAttachment[] | null | undefined>,
  attachmentId: string,
): CommunicationAttachment | undefined {
  for (const attachments of collections) {
    const attachment = attachments?.find((item) => item.id === attachmentId);
    if (attachment) return attachment;
  }
  return undefined;
}

export async function uploadCommunicationAttachments(
  files: UploadedFile[],
  options: { tenantId: string; kind: "client-message" | "support-ticket"; contextId: string },
): Promise<CommunicationAttachment[]> {
  if (files.length > MAX_COMMUNICATION_ATTACHMENTS) {
    throw AppError.badRequest(`A maximum of ${MAX_COMMUNICATION_ATTACHMENTS} files may be attached`);
  }

  const prepared = files.map((file) => {
    const fileName = sanitizeFilename(file.originalname || "untitled");
    const mimeType = file.mimetype || "application/octet-stream";
    const validation = validateFile(mimeType, file.size, fileName);
    if (!validation.valid) throw AppError.badRequest(validation.error || "Invalid attachment");
    if (file.size > MAX_COMMUNICATION_ATTACHMENT_BYTES) {
      throw AppError.badRequest("File size exceeds the maximum allowed size of 25MB");
    }
    const id = crypto.randomUUID();
    const storageKey = [
      "communication-attachments",
      sanitizeKeySegment(options.tenantId),
      options.kind,
      sanitizeKeySegment(options.contextId),
      `${id}-${fileName.replace(/\s+/g, "_")}`,
    ].join("/");
    return { file, attachment: { id, fileName, mimeType, sizeBytes: file.size, storageKey } };
  });

  const uploaded: CommunicationAttachment[] = [];
  try {
    for (const item of prepared) {
      await uploadToS3(item.file.buffer, item.attachment.storageKey, item.attachment.mimeType, options.tenantId);
      uploaded.push(item.attachment);
    }
    return uploaded;
  } catch (error) {
    await deleteCommunicationAttachments(uploaded, options.tenantId);
    throw error;
  }
}

export async function deleteCommunicationAttachments(
  attachments: CommunicationAttachment[],
  tenantId: string,
): Promise<void> {
  await Promise.all(attachments.map(async (attachment) => {
    try {
      await deleteS3Object(attachment.storageKey, tenantId);
    } catch (error) {
      console.warn("[communication-attachments] Failed to clean up uploaded object", {
        attachmentId: attachment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }));
}

export async function createCommunicationAttachmentDownload(
  attachment: CommunicationAttachment,
  tenantId: string,
): Promise<{ url: string; fileName: string }> {
  return {
    url: await createPresignedDownloadUrl(attachment.storageKey, tenantId, {
      contentDisposition: "attachment",
      contentType: attachment.mimeType,
      fileName: attachment.fileName,
    }),
    fileName: attachment.fileName,
  };
}
