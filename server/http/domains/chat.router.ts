import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import { createApiRouter } from "../routerFactory";
import { storage } from "../../storage";
import { insertChatChannelSchema, insertChatMessageSchema, chatMessages } from "@shared/schema";
import { getCurrentUserId } from "../../middleware/authContext";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/validate";
import { AppError } from "../../lib/errors";
import { chatSendRateLimiter } from "../../middleware/rateLimit";
import { emitToTenant, emitToChatChannel, emitToChatDm } from "../../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { getStorageProvider, createS3ClientFromConfig, StorageNotConfiguredError } from "../../storage/getStorageProvider";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { chatDebugStore } from "../../realtime/chatDebug";
import { db } from "../../db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";

function getCurrentTenantId(req: Request): string | null {
  return getEffectiveTenantId(req);
}

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  isPrivate: z.boolean().default(false),
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  attachmentIds: z.array(z.string()).max(10).optional(),
  parentMessageId: z.string().optional(),
});

const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(10),
});

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
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

router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { search } = req.query;
    const searchQuery = typeof search === "string" ? search.toLowerCase().trim() : "";

    const allUsers = await storage.getUsersByTenant(tenantId);
    
    let usersForTeam = allUsers.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl,
      displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    }));

    if (searchQuery) {
      usersForTeam = usersForTeam.filter(
        (u) =>
          u.displayName.toLowerCase().includes(searchQuery) ||
          u.email.toLowerCase().includes(searchQuery)
      );
    }

    res.json(usersForTeam);
  })
);

router.get(
  "/channels",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const allChannels = await storage.getChatChannelsByTenant(tenantId);
    const myMemberships = await storage.getUserChatChannels(tenantId, userId);
    const myChannelIds = new Set(myMemberships.map(m => m.channelId));
    
    const visibleChannels = allChannels.filter(
      ch => !ch.isPrivate || myChannelIds.has(ch.id)
    );

    const memberChannelIds = visibleChannels
      .filter(ch => myChannelIds.has(ch.id))
      .map(ch => ch.id);
    const unreadCounts = await storage.getUnreadCountsForChannels(userId, memberChannelIds);

    const channelsWithUnread = visibleChannels.map(ch => ({
      ...ch,
      unreadCount: myChannelIds.has(ch.id) ? (unreadCounts.get(ch.id) ?? 0) : 0,
    }));

    res.json(channelsWithUnread);
  })
);

router.get(
  "/channels/my",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const memberships = await storage.getUserChatChannels(tenantId, userId);
    res.json(memberships.map(m => m.channel));
  })
);

router.post(
  "/channels",
  validateBody(createChannelSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const data = insertChatChannelSchema.parse({
      tenantId,
      name: req.body.name,
      isPrivate: req.body.isPrivate,
      createdBy: userId,
    });

    const channel = await storage.createChatChannel(data);

    await storage.addChatChannelMember({
      tenantId,
      channelId: channel.id,
      userId,
      role: "owner",
    });

    emitToTenant(tenantId, CHAT_EVENTS.CHANNEL_CREATED, {
      channel: {
        id: channel.id,
        tenantId: channel.tenantId,
        name: channel.name,
        isPrivate: channel.isPrivate,
        createdBy: channel.createdBy,
        createdAt: channel.createdAt,
      },
    });

    res.status(201).json(channel);
  })
);

router.get(
  "/channels/:channelId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    res.json(channel);
  })
);

router.get(
  "/channels/:channelId/members",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const members = await storage.getChatChannelMembers(req.params.channelId);
    res.json(members);
  })
);

router.post(
  "/channels/:channelId/join",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    if (channel.isPrivate) {
      throw AppError.forbidden("Cannot join private channel without invitation");
    }

    const existingMember = await storage.getChatChannelMember(req.params.channelId, userId);
    if (existingMember) {
      return res.json({ message: "Already a member" });
    }

    await storage.addChatChannelMember({
      tenantId,
      channelId: channel.id,
      userId,
      role: "member",
    });

    const user = await storage.getUser(userId);
    emitToTenant(tenantId, CHAT_EVENTS.MEMBER_JOINED, {
      targetType: "channel",
      targetId: channel.id,
      userId,
      userName: user?.name || user?.email || "Unknown",
    });

    res.status(201).json({ message: "Joined channel" });
  })
);

router.delete(
  "/channels/:channelId/leave",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    await storage.removeChatChannelMember(req.params.channelId, userId);
    res.json({ message: "Left channel" });
  })
);

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
  "/channels/:channelId/messages",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    const after = req.query.after ? new Date(req.query.after as string) : undefined;

    const messages = await storage.getChatMessages("channel", req.params.channelId, limit, before, after);
    res.json(messages);
  })
);

router.get(
  "/channels/:channelId/first-unread",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
    }

    const firstUnreadId = await storage.getFirstUnreadMessageId("channel", req.params.channelId, userId);
    res.json({ firstUnreadMessageId: firstUnreadId });
  })
);

router.post(
  "/channels/:channelId/messages",
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
      conversationId: `channel:${req.params.channelId}`,
      payloadSize: req.body.body?.length || 0,
    });

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
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
      if (!parentMessage || parentMessage.channelId !== channel.id) {
        throw AppError.badRequest("Invalid parent message");
      }
      if (parentMessage.parentMessageId) {
        throw AppError.badRequest("Cannot reply to a reply - threads are single level only");
      }
    }

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: channel.id,
      dmThreadId: null,
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
      conversationId: `channel:${channel.id}`,
      metadata: { messageId: message.id },
    });

    if (attachments.length > 0) {
      await storage.linkChatAttachmentsToMessage(message.id, attachmentIds);
      attachments = await storage.getChatAttachmentsByMessageId(message.id);
    }

    const author = await storage.getUser(userId);

    const payload = {
      targetType: "channel" as const,
      targetId: channel.id,
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
    emitToChatChannel(channel.id, eventName, payload);

    chatDebugStore.logEvent({
      eventType: 'message_broadcast',
      requestId: req.requestId,
      userId,
      tenantId,
      conversationId: `channel:${channel.id}`,
      roomName: `chat:channel:${channel.id}`,
      metadata: { messageId: message.id },
    });

    res.status(201).json({ ...message, author });
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

router.get(
  "/channels/:channelId/thread-summaries",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
    }

    const summaries = await storage.getThreadSummariesForConversation("channel", req.params.channelId);
    
    const result: Record<string, { replyCount: number; lastReplyAt: Date | null; lastReplyAuthorId: string | null }> = {};
    summaries.forEach((value, key) => {
      result[key] = value;
    });

    res.json(result);
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

const markReadSchema = z.object({
  targetType: z.enum(["channel", "dm"]),
  targetId: z.string().min(1),
  lastReadMessageId: z.string().min(1),
});

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
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { q, channelId, dmThreadId, fromUserId, limit = "50", offset = "0" } = req.query;
    
    if (!q || typeof q !== "string" || q.trim().length < 2) {
      throw AppError.badRequest("Search query must be at least 2 characters");
    }

    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const results = await storage.searchChatMessages(tenantId, userId, {
      query: q.trim(),
      channelId: channelId as string | undefined,
      dmThreadId: dmThreadId as string | undefined,
      fromUserId: fromUserId as string | undefined,
      limit: limitNum,
      offset: offsetNum,
    });

    res.json(results);
  })
);

router.get(
  "/users/mentionable",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { channelId, dmThreadId, q } = req.query;
    
    let users = [];

    if (channelId && typeof channelId === "string") {
      const channel = await storage.getChatChannel(channelId);
      if (!channel || channel.tenantId !== tenantId) {
        throw AppError.notFound("Channel not found");
      }
      
      if (channel.isPrivate) {
        const members = await storage.getChatChannelMembers(channelId);
        const memberUserIds = members.map(m => m.userId);
        users = await storage.getUsersByIds(memberUserIds);
      } else {
        users = await storage.getUsersByTenant(tenantId);
      }
    } else if (dmThreadId && typeof dmThreadId === "string") {
      const dm = await storage.getChatDmThread(dmThreadId);
      if (!dm || dm.tenantId !== tenantId) {
        throw AppError.notFound("DM thread not found");
      }
      
      const participants = await storage.getChatDmParticipants(dmThreadId);
      const participantUserIds = participants.map(p => p.userId);
      users = await storage.getUsersByIds(participantUserIds);
    } else {
      users = await storage.getUsersByTenant(tenantId);
    }

    const query = typeof q === "string" ? q.toLowerCase().trim() : "";
    
    let filtered = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    }));

    if (query) {
      filtered = filtered.filter(u => 
        u.displayName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    }

    res.json(filtered.slice(0, 20));
  })
);

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20),
});

router.post(
  "/channels/:channelId/members",
  validateBody(addMembersSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { channelId } = req.params;
    const { userIds } = req.body;

    const channel = await storage.getChatChannel(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const currentMember = await storage.getChatChannelMember(channelId, userId);
    if (!currentMember) {
      throw AppError.forbidden("Only channel members can add new members");
    }

    const validUsers = [];
    for (const uid of userIds) {
      const user = await storage.getUser(uid);
      if (!user) {
        throw AppError.badRequest(`User ${uid} not found`);
      }
      if (user.tenantId !== tenantId) {
        throw AppError.badRequest(`User ${uid} does not belong to this tenant`);
      }
      validUsers.push(user);
    }

    const addedMembers = [];
    for (const user of validUsers) {
      const existingMember = await storage.getChatChannelMember(channelId, user.id);
      if (!existingMember) {
        await storage.addChatChannelMember({
          tenantId,
          channelId,
          userId: user.id,
          role: "member",
        });
        addedMembers.push(user);
      }
    }

    const currentUser = await storage.getUser(userId);

    for (const user of addedMembers) {
      emitToTenant(tenantId, CHAT_EVENTS.MEMBER_JOINED, {
        targetType: "channel",
        targetId: channelId,
        userId: user.id,
        userName: user.name || user.email || "Unknown",
      });
      
      emitToChatChannel(channelId, CHAT_EVENTS.MEMBER_ADDED, {
        targetType: "channel",
        targetId: channelId,
        userId: user.id,
        userName: user.name || user.email || "Unknown",
        userEmail: user.email || "",
        userAvatarUrl: user.avatarUrl || null,
        addedBy: userId,
      });
    }

    const members = await storage.getChatChannelMembers(channelId);
    res.status(201).json({ 
      added: addedMembers.length, 
      members 
    });
  })
);

router.delete(
  "/channels/:channelId/members/:userId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const currentUserId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { channelId, userId: targetUserId } = req.params;

    const channel = await storage.getChatChannel(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const targetMember = await storage.getChatChannelMember(channelId, targetUserId);
    if (!targetMember) {
      throw AppError.notFound("User is not a member of this channel");
    }

    const isSelf = currentUserId === targetUserId;
    const isCreator = channel.createdBy === currentUserId;
    const currentMember = await storage.getChatChannelMember(channelId, currentUserId);
    const isOwner = currentMember?.role === "owner";
    const currentUser = await storage.getUser(currentUserId);
    const isTenantAdmin = currentUser?.role === "admin";

    if (!isSelf && !isCreator && !isOwner && !isTenantAdmin) {
      throw AppError.forbidden("You do not have permission to remove this member");
    }

    const members = await storage.getChatChannelMembers(channelId);
    if (members.length <= 1) {
      throw AppError.badRequest("Cannot remove the last member from a channel");
    }

    await storage.removeChatChannelMember(channelId, targetUserId);

    const targetUser = await storage.getUser(targetUserId);

    emitToTenant(tenantId, CHAT_EVENTS.MEMBER_LEFT, {
      targetType: "channel",
      targetId: channelId,
      userId: targetUserId,
      userName: targetUser?.name || targetUser?.email || "Unknown",
      removedBy: isSelf ? null : currentUserId,
    });
    
    emitToChatChannel(channelId, CHAT_EVENTS.MEMBER_REMOVED, {
      targetType: "channel",
      targetId: channelId,
      userId: targetUserId,
      userName: targetUser?.name || targetUser?.email || "Unknown",
      removedBy: isSelf ? null : currentUserId,
    });

    res.json({ success: true, message: isSelf ? "Left channel" : "Member removed" });
  })
);

export default router;
