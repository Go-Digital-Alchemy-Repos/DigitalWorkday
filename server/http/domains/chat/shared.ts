import { z } from "zod";
import multer from "multer";
import { Request } from "express";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";

export function getCurrentTenantId(req: Request): string | null {
  return getEffectiveTenantId(req);
}

export const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  isPrivate: z.boolean().default(false),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  attachmentIds: z.array(z.string()).max(10).optional(),
  parentMessageId: z.string().optional(),
});

export const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(10),
});

export const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20),
});

export const markReadSchema = z.object({
  targetType: z.enum(["channel", "dm"]),
  targetId: z.string().min(1),
  lastReadMessageId: z.string().min(1),
});

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});
