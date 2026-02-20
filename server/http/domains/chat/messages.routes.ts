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
import { z } from "zod";
import { extractChatContext, requireMessageAccess, requireChannelMember, requireDmMember, logSecurityEvent } from "../../../features/chat/security";

const EDIT_WINDOW_MS = 5 * 60 * 1000;

const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

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
    const { tenantId, userId } = extractChatContext(req);

    await requireMessageAccess(tenantId, userId, req.params.messageId);

    const parentMessage = await storage.getChatMessage(req.params.messageId);
    if (!parentMessage || parentMessage.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
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
    const { tenantId, userId } = extractChatContext(req);

    const container = await requireMessageAccess(tenantId, userId, req.params.messageId);

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only edit your own messages");
    }

    if (message.deletedAt) {
      throw AppError.badRequest("Cannot edit a deleted message");
    }

    const elapsed = Date.now() - new Date(message.createdAt).getTime();
    if (elapsed > EDIT_WINDOW_MS) {
      throw AppError.forbidden("Edit window has expired. Messages can only be edited within 5 minutes of sending.");
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
    const { tenantId, userId } = extractChatContext(req);

    await requireMessageAccess(tenantId, userId, req.params.messageId);

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.deletedAt) {
      throw AppError.badRequest("Message already deleted");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only delete your own messages");
    }

    await storage.deleteChatMessage(req.params.messageId, userId);

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const deletePayload = {
      targetType,
      targetId,
      messageId: message.id,
      deletedByUserId: userId,
    };
    
    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    }

    res.json({ message: "Message deleted" });
  })
);

router.get(
  "/messages/:messageId/reactions",
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractChatContext(req);

    await requireMessageAccess(tenantId, userId, req.params.messageId);

    const reactions = await storage.getReactionsForMessage(req.params.messageId);
    res.json(reactions);
  })
);

router.post(
  "/messages/:messageId/reactions",
  validateBody(reactionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractChatContext(req);

    const container = await requireMessageAccess(tenantId, userId, req.params.messageId);

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.deletedAt) {
      throw AppError.badRequest("Cannot react to a deleted message");
    }

    const reaction = await storage.addReaction(tenantId, req.params.messageId, userId, req.body.emoji);
    const user = await storage.getUser(userId);

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const reactionPayload = {
      targetType,
      targetId,
      messageId: message.id,
      userId,
      emoji: req.body.emoji,
      action: "add" as const,
      user: user ? { id: user.id, name: user.name || '', avatarUrl: user.avatarUrl } : undefined,
    };

    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_REACTION, reactionPayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_REACTION, reactionPayload);
    }

    res.status(201).json(reaction);
  })
);

router.delete(
  "/messages/:messageId/reactions/:emoji",
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, userId } = extractChatContext(req);

    await requireMessageAccess(tenantId, userId, req.params.messageId);

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    const emoji = decodeURIComponent(req.params.emoji);
    const removed = await storage.removeReaction(tenantId, req.params.messageId, userId, emoji);
    if (!removed) {
      throw AppError.notFound("Reaction not found");
    }

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const reactionPayload = {
      targetType,
      targetId,
      messageId: message.id,
      userId,
      emoji,
      action: "remove" as const,
    };

    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_REACTION, reactionPayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_REACTION, reactionPayload);
    }

    res.json({ success: true });
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
