import { Router, Request, Response } from "express";
import { storage } from "../../../storage";
import { insertChatChannelSchema, insertChatMessageSchema } from "@shared/schema";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { validateBody } from "../../../middleware/validate";
import { AppError } from "../../../lib/errors";
import { chatSendRateLimiter } from "../../../middleware/rateLimit";
import { emitToTenant, emitToChatChannel } from "../../../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { chatDebugStore } from "../../../realtime/chatDebug";
import { getCurrentTenantId, createChannelSchema, sendMessageSchema, addMembersSchema } from "./shared";
import { extractChatContext, requireChannelMember, requireChannelMemberStrict, logSecurityEvent } from "../../../features/chat/security";

const router = Router();

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
    const { tenantId, userId } = extractChatContext(req);

    await requireChannelMember(tenantId, userId, req.params.channelId);
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
    const { tenantId, userId } = extractChatContext(req);

    await requireChannelMember(tenantId, userId, req.params.channelId);

    const channel = await storage.getChatChannel(req.params.channelId);
    if (channel?.isPrivate) {
      await requireChannelMemberStrict(tenantId, userId, req.params.channelId);
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

    (async () => {
      try {
        const { notifyChatMessage } = await import("../../../features/notifications/notification.service");
        const members = await storage.getChatChannelMembers(channel.id);
        const senderName = author?.name || "Someone";
        const preview = req.body.body || "";
        for (const m of members) {
          if (m.userId === userId) continue;
          notifyChatMessage(
            m.userId,
            channel.id,
            channel.name,
            senderName,
            preview,
            { tenantId, excludeUserId: userId }
          ).catch(() => {});
        }
      } catch (e) {
        console.warn("[chat] Failed to emit chat notifications:", e);
      }
    })();

    res.status(201).json({ ...message, author });
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

router.get(
  "/channels/:channelId/pins",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    if (channel.isPrivate) {
      const member = await storage.getChatChannelMember(req.params.channelId, userId);
      if (!member) {
        throw AppError.forbidden("You are not a member of this private channel");
      }
    }

    const pins = await storage.getPinnedMessages(req.params.channelId, tenantId);
    res.json(pins);
  })
);

router.post(
  "/channels/:channelId/pins",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { messageId } = req.body;
    if (!messageId) throw AppError.badRequest("messageId is required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const user = await storage.getUser(userId);
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const isChannelOwner = channel.createdBy === userId;
    if (!isAdmin && !isChannelOwner) {
      throw AppError.forbidden("Only admins or channel owners can pin messages");
    }

    const message = await storage.getChatMessage(messageId);
    if (!message || message.channelId !== req.params.channelId || message.tenantId !== tenantId) {
      throw AppError.badRequest("Message does not belong to this channel");
    }

    if (message.parentMessageId) {
      throw AppError.badRequest("Thread replies cannot be pinned");
    }

    const existingPin = await storage.getPin(req.params.channelId, messageId);
    if (existingPin) {
      throw AppError.badRequest("Message is already pinned");
    }

    const pin = await storage.createPin({
      tenantId,
      channelId: req.params.channelId,
      messageId,
      pinnedByUserId: userId,
    });

    emitToChatChannel(req.params.channelId, CHAT_EVENTS.MESSAGE_PINNED, {
      channelId: req.params.channelId,
      messageId,
      pinnedByUserId: userId,
      pinnedByName: user?.name || user?.email || "Unknown",
    });

    res.status(201).json(pin);
  })
);

router.delete(
  "/channels/:channelId/pins",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { messageId } = req.body;
    if (!messageId) throw AppError.badRequest("messageId is required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const user = await storage.getUser(userId);
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const isChannelOwner = channel.createdBy === userId;
    if (!isAdmin && !isChannelOwner) {
      throw AppError.forbidden("Only admins or channel owners can unpin messages");
    }

    const deleted = await storage.deletePin(req.params.channelId, messageId, tenantId);
    if (!deleted) {
      throw AppError.notFound("Pin not found");
    }

    emitToChatChannel(req.params.channelId, CHAT_EVENTS.MESSAGE_UNPINNED, {
      channelId: req.params.channelId,
      messageId,
      pinnedByUserId: userId,
      pinnedByName: user?.name || user?.email || "Unknown",
    });

    res.json({ success: true });
  })
);

export default router;
