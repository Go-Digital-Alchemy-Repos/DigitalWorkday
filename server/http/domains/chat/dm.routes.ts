import { Router, Request, Response } from "express";
import { storage } from "../../../storage";
import { insertChatMessageSchema } from "@shared/schema";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { validateBody } from "../../../middleware/validate";
import { AppError } from "../../../lib/errors";
import { chatSendRateLimiter } from "../../../middleware/rateLimit";
import { emitToChatDm } from "../../../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { chatDebugStore } from "../../../realtime/chatDebug";
import { getCurrentTenantId, createDmSchema, sendMessageSchema } from "./shared";

const router = Router();

router.get(
  "/dm",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    
    const threadIds = threads.map(t => t.id);
    const unreadCounts = await storage.getUnreadCountsForDmThreads(userId, threadIds);

    const threadsWithUnread = threads.map(thread => ({
      ...thread,
      unreadCount: unreadCounts.get(thread.id) ?? 0,
    }));

    res.json(threadsWithUnread);
  })
);

router.post(
  "/dm",
  validateBody(createDmSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const memberUserIds = Array.from(new Set([userId, ...req.body.userIds]));

    const existingThread = await storage.getChatDmThreadByMembers(tenantId, memberUserIds);
    if (existingThread) {
      return res.json(existingThread);
    }

    const thread = await storage.createChatDmThread({ tenantId }, memberUserIds);
    res.status(201).json(thread);
  })
);

router.get(
  "/dm/:dmId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    res.json(thread);
  })
);

router.get(
  "/dm/:dmId/messages",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    const after = req.query.after ? new Date(req.query.after as string) : undefined;

    const messages = await storage.getChatMessages("dm", req.params.dmId, limit, before, after);
    res.json(messages);
  })
);

router.get(
  "/dm/:dmId/first-unread",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    const firstUnreadId = await storage.getFirstUnreadMessageId("dm", req.params.dmId, userId);
    res.json({ firstUnreadMessageId: firstUnreadId });
  })
);

router.post(
  "/dm/:dmId/messages",
  chatSendRateLimiter,
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    chatDebugStore.logEvent({
      eventType: 'message_send_attempt',
      requestId: req.requestId,
      userId,
      tenantId,
      conversationId: `dm:${req.params.dmId}`,
      payloadSize: req.body.body?.length || 0,
    });

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    const attachmentIds: string[] = req.body.attachmentIds || [];
    let attachments: any[] = [];
    if (attachmentIds.length > 0) {
      attachments = await storage.getChatAttachmentsByTenantAndIds(tenantId, attachmentIds);
      if (attachments.length !== attachmentIds.length) {
        throw AppError.badRequest("One or more attachments are invalid or belong to another tenant");
      }
      const alreadyLinked = attachments.filter(a => a.messageId !== null);
      if (alreadyLinked.length > 0) {
        throw AppError.badRequest("One or more attachments are already linked to a message");
      }
    }

    const parentMessageId = req.body.parentMessageId;
    if (parentMessageId) {
      const parentMessage = await storage.getChatMessage(parentMessageId);
      if (!parentMessage || parentMessage.dmThreadId !== thread.id) {
        throw AppError.badRequest("Invalid parent message");
      }
      if (parentMessage.parentMessageId) {
        throw AppError.badRequest("Cannot reply to a reply - threads are single level only");
      }
    }

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: null,
      dmThreadId: thread.id,
      authorUserId: userId,
      body: req.body.body,
      parentMessageId: parentMessageId || null,
    });

    const message = await storage.createChatMessage(data);

    chatDebugStore.logEvent({
      eventType: 'message_persisted',
      requestId: req.requestId,
      userId,
      tenantId,
      conversationId: `dm:${thread.id}`,
      metadata: { messageId: message.id },
    });

    if (attachments.length > 0) {
      await storage.linkChatAttachmentsToMessage(message.id, attachmentIds);
      attachments = await storage.getChatAttachmentsByMessageId(message.id);
    }

    const author = await storage.getUser(userId);

    const payload = {
      targetType: "dm" as const,
      targetId: thread.id,
      message: {
        id: message.id,
        tenantId: message.tenantId,
        channelId: message.channelId,
        dmThreadId: message.dmThreadId,
        authorUserId: message.authorUserId,
        body: message.body,
        parentMessageId: message.parentMessageId,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        attachments: attachments.map(a => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: a.url,
        })),
        author: author ? {
          id: author.id,
          name: author.name,
          email: author.email,
          avatarUrl: author.avatarUrl,
        } : undefined,
      },
    };

    const eventName = message.parentMessageId 
      ? CHAT_EVENTS.THREAD_REPLY_CREATED 
      : CHAT_EVENTS.NEW_MESSAGE;
    emitToChatDm(thread.id, eventName, payload);

    chatDebugStore.logEvent({
      eventType: 'message_broadcast',
      requestId: req.requestId,
      userId,
      tenantId,
      conversationId: `dm:${thread.id}`,
      roomName: `chat:dm:${thread.id}`,
      metadata: { messageId: message.id },
    });

    res.status(201).json({ ...message, author });
  })
);

router.get(
  "/dm/:dmThreadId/thread-summaries",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const isMember = await storage.isUserInDmThread(req.params.dmThreadId, userId);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM");
    }

    const summaries = await storage.getThreadSummariesForConversation("dm", req.params.dmThreadId);
    
    const result: Record<string, { replyCount: number; lastReplyAt: Date | null; lastReplyAuthorId: string | null }> = {};
    summaries.forEach((value, key) => {
      result[key] = value;
    });

    res.json(result);
  })
);

export default router;
