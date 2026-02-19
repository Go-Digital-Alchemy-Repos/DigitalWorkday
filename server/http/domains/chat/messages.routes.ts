import { Router, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../../../storage";
import { chatMessages } from "@shared/schema";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { validateBody } from "../../../middleware/validate";
import { AppError } from "../../../lib/errors";
import { emitToChatChannel, emitToChatDm } from "../../../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { getStorageProvider, createS3ClientFromConfig, StorageNotConfiguredError } from "../../../storage/getStorageProvider";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../../../db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { getCurrentTenantId, sendMessageSchema, markReadSchema, upload } from "./shared";

const router = Router();

router.get(
  "/messages/recent-since-login",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const user = await storage.getUser(userId);
    if (!user) return res.json([]);

    const sinceDate = user.updatedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const messages = await db.select({
      id: chatMessages.id,
      content: chatMessages.body,
      createdAt: chatMessages.createdAt,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
      authorId: chatMessages.authorUserId,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.tenantId, tenantId),
        sql`${chatMessages.createdAt} > ${sinceDate}`,
        sql`${chatMessages.authorUserId} != ${userId}`,
        isNull(chatMessages.archivedAt)
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(10);

    const authorIds = [...new Set(messages.map(msg => msg.authorId))];
    const authors = await storage.getUsersByIds(authorIds);
    const authorMap = new Map(authors.map(a => [a.id, a]));

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      author: authorMap.get(msg.authorId) ?? undefined,
    }));

    res.json(enrichedMessages);
  })
);

router.get(
  "/messages/:messageId/thread",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const parentMessage = await storage.getChatMessage(req.params.messageId);
    if (!parentMessage || parentMessage.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (parentMessage.channelId) {
      const channel = await storage.getChatChannel(parentMessage.channelId);
      if (!channel || channel.tenantId !== tenantId) {
        throw AppError.notFound("Channel not found");
      }
      const member = await storage.getChatChannelMember(parentMessage.channelId, userId);
      if (!member && channel.isPrivate) {
        throw AppError.forbidden("Not a member of this private channel");
      }
    } else if (parentMessage.dmThreadId) {
      const isMember = await storage.isUserInDmThread(parentMessage.dmThreadId, userId);
      if (!isMember) {
        throw AppError.forbidden("Not a member of this DM");
      }
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const replies = await storage.getThreadReplies(req.params.messageId, limit);
    
    const parentAuthor = await storage.getUser(parentMessage.authorUserId);
    
    res.json({
      parentMessage: { ...parentMessage, author: parentAuthor },
      replies,
    });
  })
);

router.patch(
  "/messages/:messageId",
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only edit your own messages");
    }

    const updated = await storage.updateChatMessage(req.params.messageId, {
      body: req.body.body,
    });

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const updatePayload = {
      targetType,
      targetId,
      messageId: message.id,
      updates: { body: req.body.body, editedAt: updated?.editedAt },
    };
    
    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_UPDATED, updatePayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_UPDATED, updatePayload);
    }

    res.json(updated);
  })
);

router.delete(
  "/messages/:messageId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only delete your own messages");
    }

    await storage.deleteChatMessage(req.params.messageId);

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const deletePayload = {
      targetType,
      targetId,
      messageId: message.id,
    };
    
    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    }

    res.json({ message: "Message deleted" });
  })
);

router.post(
  "/uploads",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    if (!req.file) throw AppError.badRequest("No file provided");

    let storageProvider;
    try {
      storageProvider = await getStorageProvider(tenantId);
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        throw AppError.badRequest("File storage is not configured for this tenant");
      }
      throw err;
    }

    const { config, source } = storageProvider;
    const s3Client = createS3ClientFromConfig(config);

    const fileId = crypto.randomUUID();
    const ext = req.file.originalname.split(".").pop() || "";
    const safeFileName = `${fileId}${ext ? `.${ext}` : ""}`;
    
    let keyPrefix = config.keyPrefixTemplate || "chat-attachments";
    keyPrefix = keyPrefix.replace("{{tenantId}}", tenantId);
    const s3Key = `${keyPrefix}/${tenantId}/${safeFileName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        "tenant-id": tenantId,
        "uploaded-by": userId,
        "original-name": encodeURIComponent(req.file.originalname),
      },
    }));

    const url = `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${s3Key}`;

    const attachment = await storage.createChatAttachment({
      tenantId,
      messageId: null,
      s3Key,
      url,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachment.url,
      storageSource: source,
    });
  })
);

router.post(
  "/reads",
  validateBody(markReadSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { targetType, targetId, lastReadMessageId } = req.body;

    if (targetType === "channel") {
      const channel = await storage.getChatChannel(targetId);
      if (!channel || channel.tenantId !== tenantId) {
        throw AppError.notFound("Channel not found");
      }
      const memberships = await storage.getUserChatChannels(tenantId, userId);
      const isMember = memberships.some(m => m.channelId === targetId);
      if (!isMember) {
        throw AppError.forbidden("Not a member of this channel");
      }
    } else {
      const thread = await storage.getChatDmThread(targetId);
      if (!thread || thread.tenantId !== tenantId) {
        throw AppError.notFound("DM thread not found");
      }
      const threads = await storage.getUserChatDmThreads(tenantId, userId);
      const isMember = threads.some(t => t.id === targetId);
      if (!isMember) {
        throw AppError.forbidden("Not a member of this DM thread");
      }
    }

    const message = await storage.getChatMessage(lastReadMessageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }
    if (targetType === "channel" && message.channelId !== targetId) {
      throw AppError.badRequest("Message does not belong to this channel");
    }
    if (targetType === "dm" && message.dmThreadId !== targetId) {
      throw AppError.badRequest("Message does not belong to this DM thread");
    }

    const readResult = await storage.upsertChatRead(tenantId, userId, targetType, targetId, lastReadMessageId);

    const readPayload = {
      targetType,
      targetId,
      userId,
      lastReadAt: readResult.lastReadAt,
      lastReadMessageId,
    };
    if (targetType === "channel") {
      emitToChatChannel(targetId, CHAT_EVENTS.CONVERSATION_READ, readPayload);
    } else {
      emitToChatDm(targetId, CHAT_EVENTS.CONVERSATION_READ, readPayload);
    }

    res.json({ success: true });
  })
);

router.get(
  "/reads/:targetType/:targetId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { targetType, targetId } = req.params;
    if (targetType !== "channel" && targetType !== "dm") {
      throw AppError.badRequest("targetType must be 'channel' or 'dm'");
    }

    if (targetType === "channel") {
      const channel = await storage.getChatChannel(targetId);
      if (!channel || channel.tenantId !== tenantId) {
        throw AppError.notFound("Channel not found");
      }
      const memberships = await storage.getUserChatChannels(tenantId, userId);
      if (!memberships.some(m => m.channelId === targetId)) {
        throw AppError.forbidden("Not a member of this channel");
      }
    } else {
      const thread = await storage.getChatDmThread(targetId);
      if (!thread || thread.tenantId !== tenantId) {
        throw AppError.notFound("DM thread not found");
      }
      const threads = await storage.getUserChatDmThreads(tenantId, userId);
      if (!threads.some(t => t.id === targetId)) {
        throw AppError.forbidden("Not a member of this DM thread");
      }
    }

    const receipts = await storage.getConversationReadReceipts(targetType, targetId, tenantId);
    res.json(receipts);
  })
);

export default router;
