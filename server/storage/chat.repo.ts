import {
  type User,
  type ChatChannel, type InsertChatChannel,
  type ChatChannelMember, type InsertChatChannelMember,
  type ChatDmThread, type InsertChatDmThread,
  type ChatDmMember,
  type ChatMessage, type InsertChatMessage,
  type ChatAttachment, type InsertChatAttachment,
  type ChatExportJob, type InsertChatExportJob,
  type ChatMessageReaction,
  type ChatPin, type InsertChatPin,
  users,
  chatChannels, chatChannelMembers,
  chatDmThreads, chatDmMembers,
  chatMessages, chatAttachments, chatReads, chatExportJobs,
  chatMessageReactions, chatPins,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, inArray, gte, lte, lt, gt, isNull, sql, ilike, or, type SQL } from "drizzle-orm";

export class ChatRepository {

  async getChatChannel(id: string): Promise<ChatChannel | undefined> {
    const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.id, id));
    return channel || undefined;
  }

  async getChatChannelsByTenant(tenantId: string): Promise<ChatChannel[]> {
    return db.select().from(chatChannels).where(eq(chatChannels.tenantId, tenantId)).orderBy(asc(chatChannels.name));
  }

  async createChatChannel(channel: InsertChatChannel): Promise<ChatChannel> {
    const [newChannel] = await db.insert(chatChannels).values(channel).returning();
    return newChannel;
  }

  async updateChatChannel(id: string, channel: Partial<InsertChatChannel>): Promise<ChatChannel | undefined> {
    const [updated] = await db.update(chatChannels).set(channel).where(eq(chatChannels.id, id)).returning();
    return updated || undefined;
  }

  async deleteChatChannel(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.channelId, id));
    await db.delete(chatChannelMembers).where(eq(chatChannelMembers.channelId, id));
    await db.delete(chatChannels).where(eq(chatChannels.id, id));
  }

  async getChatChannelMember(channelId: string, userId: string): Promise<ChatChannelMember | undefined> {
    const [member] = await db.select().from(chatChannelMembers).where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))
    );
    return member || undefined;
  }

  async getChatChannelMembers(channelId: string): Promise<(ChatChannelMember & { user: User })[]> {
    const members = await db.select().from(chatChannelMembers).where(eq(chatChannelMembers.channelId, channelId));
    if (members.length === 0) return [];

    const userIds = members.map(m => m.userId);
    const userRows = await db.select().from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    return members.map(m => ({
      ...m,
      user: userMap.get(m.userId)!,
    })).filter(m => m.user);
  }

  async getUserChatChannels(tenantId: string, userId: string): Promise<(ChatChannelMember & { channel: ChatChannel })[]> {
    const memberships = await db.select().from(chatChannelMembers).where(
      and(eq(chatChannelMembers.tenantId, tenantId), eq(chatChannelMembers.userId, userId))
    );
    if (memberships.length === 0) return [];

    const channelIds = memberships.map(m => m.channelId);
    const channelRows = await db.select().from(chatChannels).where(inArray(chatChannels.id, channelIds));
    const channelMap = new Map(channelRows.map(c => [c.id, c]));

    return memberships.map(m => ({
      ...m,
      channel: channelMap.get(m.channelId)!,
    })).filter(m => m.channel);
  }

  async addChatChannelMember(member: InsertChatChannelMember): Promise<ChatChannelMember> {
    const [newMember] = await db.insert(chatChannelMembers).values(member).returning();
    return newMember;
  }

  async removeChatChannelMember(channelId: string, userId: string): Promise<void> {
    await db.delete(chatChannelMembers).where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))
    );
  }

  async validateChatRoomAccess(targetType: 'channel' | 'dm', targetId: string, userId: string, tenantId: string): Promise<boolean> {
    if (targetType === 'channel') {
      const channel = await this.getChatChannel(targetId);
      if (!channel || channel.tenantId !== tenantId) return false;
      if (!channel.isPrivate) return true;
      const member = await this.getChatChannelMember(targetId, userId);
      return !!member;
    } else {
      const thread = await this.getChatDmThread(targetId);
      if (!thread || thread.tenantId !== tenantId) return false;
      const members = await db.select().from(chatDmMembers).where(
        and(eq(chatDmMembers.dmThreadId, targetId), eq(chatDmMembers.userId, userId))
      );
      return members.length > 0;
    }
  }

  async getChatDmThread(id: string): Promise<ChatDmThread | undefined> {
    const [thread] = await db.select().from(chatDmThreads).where(eq(chatDmThreads.id, id));
    return thread || undefined;
  }

  async getChatDmThreadByMembers(tenantId: string, userIds: string[]): Promise<ChatDmThread | undefined> {
    if (userIds.length < 2) return undefined;

    const result = await db.select({ dmThreadId: chatDmMembers.dmThreadId })
      .from(chatDmMembers)
      .where(and(
        eq(chatDmMembers.tenantId, tenantId),
        inArray(chatDmMembers.userId, userIds)
      ))
      .groupBy(chatDmMembers.dmThreadId)
      .having(sql`count(distinct ${chatDmMembers.userId}) = ${userIds.length}`);

    if (result.length === 0) return undefined;

    for (const { dmThreadId } of result) {
      const allMembers = await db.select({ count: sql<number>`count(*)` })
        .from(chatDmMembers)
        .where(eq(chatDmMembers.dmThreadId, dmThreadId));

      if (Number(allMembers[0].count) === userIds.length) {
        const [thread] = await db.select().from(chatDmThreads).where(eq(chatDmThreads.id, dmThreadId));
        return thread || undefined;
      }
    }
    return undefined;
  }

  async getUserChatDmThreads(tenantId: string, userId: string): Promise<(ChatDmThread & { members: (ChatDmMember & { user: User })[] })[]> {
    const memberships = await db.select().from(chatDmMembers).where(
      and(eq(chatDmMembers.tenantId, tenantId), eq(chatDmMembers.userId, userId))
    );
    if (memberships.length === 0) return [];

    const threadIds = memberships.map(m => m.dmThreadId);
    const threads = await db.select().from(chatDmThreads).where(inArray(chatDmThreads.id, threadIds));

    const allMembers = await db.select().from(chatDmMembers).where(inArray(chatDmMembers.dmThreadId, threadIds));
    const allUserIds = [...new Set(allMembers.map(m => m.userId))];
    const userRows = await db.select().from(users).where(inArray(users.id, allUserIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    return threads.map(thread => ({
      ...thread,
      members: allMembers
        .filter(m => m.dmThreadId === thread.id)
        .map(m => ({ ...m, user: userMap.get(m.userId)! }))
        .filter(m => m.user),
    }));
  }

  async getChatDmParticipants(dmThreadId: string): Promise<ChatDmMember[]> {
    return await db.select().from(chatDmMembers).where(eq(chatDmMembers.dmThreadId, dmThreadId));
  }

  async createChatDmThread(thread: InsertChatDmThread, memberUserIds: string[]): Promise<ChatDmThread> {
    const [newThread] = await db.insert(chatDmThreads).values(thread).returning();
    
    for (const userId of memberUserIds) {
      await db.insert(chatDmMembers).values({
        tenantId: thread.tenantId,
        dmThreadId: newThread.id,
        userId,
      });
    }
    
    return newThread;
  }

  async getChatMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return message || undefined;
  }

  async getChatMessages(targetType: 'channel' | 'dm', targetId: string, limit = 50, before?: Date, after?: Date): Promise<(ChatMessage & { author: User; reactions?: (ChatMessageReaction & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> })[] })[]> {
    const perfStart = process.env.CHAT_PERF_LOG === '1' ? performance.now() : 0;
    const targetColumn = targetType === 'channel' ? chatMessages.channelId : chatMessages.dmThreadId;
    
    const conditions: SQL[] = [
      eq(targetColumn, targetId),
      isNull(chatMessages.archivedAt)
    ];
    if (before) {
      conditions.push(lt(chatMessages.createdAt, before));
    }
    if (after) {
      conditions.push(gte(chatMessages.createdAt, after));
    }

    const messages = await db.select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
      
    if (messages.length === 0) return [];

    const authorIds = [...new Set(messages.map(m => m.authorUserId))];
    const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
    const authorMap = new Map(authorRows.map(u => [u.id, u]));

    const messageIds = messages.map(m => m.id);
    const reactionsMap = await this.getReactionsForMessages(messageIds);

    const result = messages
      .map(m => ({
        ...m,
        author: authorMap.get(m.authorUserId)!,
        reactions: reactionsMap.get(m.id) || [],
      }))
      .filter(m => m.author)
      .reverse();

    if (process.env.CHAT_PERF_LOG === '1') {
      console.log(`[chat-perf] getChatMessages(${targetType}, ${targetId}): ${(performance.now() - perfStart).toFixed(1)}ms, ${result.length} messages`);
    }

    return result;
  }

  async getFirstUnreadMessageId(targetType: 'channel' | 'dm', targetId: string, userId: string): Promise<string | null> {
    const readRecord = targetType === 'channel' 
      ? await this.getChatReadForChannel(userId, targetId)
      : await this.getChatReadForDm(userId, targetId);
    
    if (!readRecord?.lastReadMessageId) {
      const targetColumn = targetType === 'channel' ? chatMessages.channelId : chatMessages.dmThreadId;
      const [firstMsg] = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(
          eq(targetColumn, targetId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.parentMessageId)
        ))
        .orderBy(chatMessages.createdAt)
        .limit(1);
      return firstMsg?.id || null;
    }

    const [lastReadMsg] = await db.select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, readRecord.lastReadMessageId));

    if (!lastReadMsg) return null;

    const targetColumn = targetType === 'channel' ? chatMessages.channelId : chatMessages.dmThreadId;
    const [firstUnread] = await db.select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(
        eq(targetColumn, targetId),
        gt(chatMessages.createdAt, lastReadMsg.createdAt),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.parentMessageId)
      ))
      .orderBy(chatMessages.createdAt)
      .limit(1);

    return firstUnread?.id || null;
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }

  async updateChatMessage(id: string, updates: Partial<InsertChatMessage>): Promise<ChatMessage | undefined> {
    const [updated] = await db.update(chatMessages).set({
      ...updates,
      editedAt: new Date(),
    }).where(eq(chatMessages.id, id)).returning();
    return updated || undefined;
  }

  async deleteChatMessage(id: string, deletedByUserId?: string): Promise<void> {
    await db.update(chatMessages).set({
      deletedAt: new Date(),
      deletedByUserId: deletedByUserId || null,
      body: "[Message deleted]",
    }).where(eq(chatMessages.id, id));
  }

  async addReaction(tenantId: string, messageId: string, userId: string, emoji: string): Promise<ChatMessageReaction> {
    const [reaction] = await db.insert(chatMessageReactions).values({
      tenantId,
      messageId,
      userId,
      emoji,
    }).onConflictDoNothing().returning();
    if (!reaction) {
      const [existing] = await db.select().from(chatMessageReactions).where(
        and(
          eq(chatMessageReactions.messageId, messageId),
          eq(chatMessageReactions.userId, userId),
          eq(chatMessageReactions.emoji, emoji),
        )
      );
      return existing;
    }
    return reaction;
  }

  async removeReaction(tenantId: string, messageId: string, userId: string, emoji: string): Promise<boolean> {
    const result = await db.delete(chatMessageReactions).where(
      and(
        eq(chatMessageReactions.tenantId, tenantId),
        eq(chatMessageReactions.messageId, messageId),
        eq(chatMessageReactions.userId, userId),
        eq(chatMessageReactions.emoji, emoji),
      )
    ).returning();
    return result.length > 0;
  }

  async getReactionsForMessage(messageId: string): Promise<(ChatMessageReaction & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> })[]> {
    const reactions = await db.select().from(chatMessageReactions)
      .where(eq(chatMessageReactions.messageId, messageId))
      .orderBy(asc(chatMessageReactions.createdAt));
    if (reactions.length === 0) return [];
    const userIds = [...new Set(reactions.map(r => r.userId))];
    const userRows = await db.select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    }).from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));
    return reactions.map(r => ({
      ...r,
      user: userMap.get(r.userId) || { id: r.userId, name: 'Unknown', avatarUrl: null },
    }));
  }

  async getReactionsForMessages(messageIds: string[]): Promise<Map<string, (ChatMessageReaction & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> })[]>> {
    if (messageIds.length === 0) return new Map();
    const reactions = await db.select().from(chatMessageReactions)
      .where(inArray(chatMessageReactions.messageId, messageIds))
      .orderBy(asc(chatMessageReactions.createdAt));
    if (reactions.length === 0) return new Map();
    const userIds = [...new Set(reactions.map(r => r.userId))];
    const userRows = await db.select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    }).from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));
    const result = new Map<string, (ChatMessageReaction & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> })[]>();
    for (const r of reactions) {
      const enriched = {
        ...r,
        user: userMap.get(r.userId) || { id: r.userId, name: 'Unknown', avatarUrl: null },
      };
      const arr = result.get(r.messageId) || [];
      arr.push(enriched);
      result.set(r.messageId, arr);
    }
    return result;
  }

  async getThreadReplies(parentMessageId: string, limit = 100): Promise<(ChatMessage & { author: User })[]> {
    const replies = await db.select().from(chatMessages)
      .where(and(
        eq(chatMessages.parentMessageId, parentMessageId),
        isNull(chatMessages.deletedAt)
      ))
      .orderBy(asc(chatMessages.createdAt))
      .limit(limit);

    if (replies.length === 0) return [];

    const authorIds = [...new Set(replies.map(m => m.authorUserId))];
    const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
    const authorMap = new Map(authorRows.map(u => [u.id, u]));

    return replies
      .map(m => ({ ...m, author: authorMap.get(m.authorUserId)! }))
      .filter(m => m.author);
  }

  async getThreadReplyCount(parentMessageId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.parentMessageId, parentMessageId),
        isNull(chatMessages.deletedAt)
      ));
    return Number(result[0]?.count || 0);
  }

  async getThreadSummariesForConversation(targetType: 'channel' | 'dm', targetId: string): Promise<Map<string, { replyCount: number; lastReplyAt: Date | null; lastReplyAuthorId: string | null }>> {
    const summaries = new Map<string, { replyCount: number; lastReplyAt: Date | null; lastReplyAuthorId: string | null }>();

    const parentIdsQuery = targetType === 'channel'
      ? await db.select({ id: chatMessages.id })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.channelId, targetId),
            isNull(chatMessages.parentMessageId),
            isNull(chatMessages.deletedAt)
          ))
      : await db.select({ id: chatMessages.id })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.dmThreadId, targetId),
            isNull(chatMessages.parentMessageId),
            isNull(chatMessages.deletedAt)
          ));

    const parentIds = parentIdsQuery.map(p => p.id);
    if (parentIds.length === 0) return summaries;

    const replyStats = await db.select({
      parentMessageId: chatMessages.parentMessageId,
      count: sql<number>`count(*)`,
      lastReplyAt: sql<Date>`max(${chatMessages.createdAt})`,
    })
      .from(chatMessages)
      .where(and(
        inArray(chatMessages.parentMessageId, parentIds),
        isNull(chatMessages.deletedAt)
      ))
      .groupBy(chatMessages.parentMessageId);

    for (const stat of replyStats) {
      if (!stat.parentMessageId) continue;
      
      const [lastReply] = await db.select({ authorUserId: chatMessages.authorUserId })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.parentMessageId, stat.parentMessageId),
          isNull(chatMessages.deletedAt)
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      summaries.set(stat.parentMessageId, {
        replyCount: Number(stat.count),
        lastReplyAt: stat.lastReplyAt,
        lastReplyAuthorId: lastReply?.authorUserId || null,
      });
    }

    return summaries;
  }

  async searchChatMessages(tenantId: string, userId: string, options: {
    query: string;
    channelId?: string;
    dmThreadId?: string;
    fromUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: any[]; total: number }> {
    const { query, channelId, dmThreadId, fromUserId, limit = 50, offset = 0 } = options;
    
    const accessibleChannelIds = (await this.getUserChatChannels(tenantId, userId)).map(m => m.channelId);
    const accessibleDmIds = (await this.getUserChatDmThreads(tenantId, userId)).map(dm => dm.id);

    const conditions: any[] = [
      eq(chatMessages.tenantId, tenantId),
      isNull(chatMessages.deletedAt),
      isNull(chatMessages.archivedAt),
      ilike(chatMessages.body, `%${query}%`),
    ];

    if (channelId) {
      if (!accessibleChannelIds.includes(channelId)) {
        return { messages: [], total: 0 };
      }
      conditions.push(eq(chatMessages.channelId, channelId));
    } else if (dmThreadId) {
      if (!accessibleDmIds.includes(dmThreadId)) {
        return { messages: [], total: 0 };
      }
      conditions.push(eq(chatMessages.dmThreadId, dmThreadId));
    } else {
      const accessConditions = [];
      if (accessibleChannelIds.length > 0) {
        accessConditions.push(inArray(chatMessages.channelId, accessibleChannelIds));
      }
      if (accessibleDmIds.length > 0) {
        accessConditions.push(inArray(chatMessages.dmThreadId, accessibleDmIds));
      }
      if (accessConditions.length > 0) {
        conditions.push(or(...accessConditions)!);
      } else {
        return { messages: [], total: 0 };
      }
    }

    if (fromUserId) {
      conditions.push(eq(chatMessages.authorUserId, fromUserId));
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(...conditions));

    const messages = await db.select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
      authorId: chatMessages.authorUserId,
      authorEmail: users.email,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      channelName: chatChannels.name,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.authorUserId, users.id))
    .leftJoin(chatChannels, eq(chatMessages.channelId, chatChannels.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)
    .offset(offset);

    return {
      messages: messages.map(m => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        channelId: m.channelId,
        dmThreadId: m.dmThreadId,
        channelName: m.channelName,
        author: {
          id: m.authorId,
          email: m.authorEmail,
          displayName: `${m.authorFirstName || ""} ${m.authorLastName || ""}`.trim() || m.authorEmail,
        },
      })),
      total: countResult?.count || 0,
    };
  }

  async createChatAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment> {
    const [newAttachment] = await db.insert(chatAttachments).values(attachment).returning();
    return newAttachment;
  }

  async getChatAttachmentsByMessageId(messageId: string): Promise<ChatAttachment[]> {
    return db.select().from(chatAttachments).where(eq(chatAttachments.messageId, messageId));
  }

  async getChatAttachment(id: string): Promise<ChatAttachment | undefined> {
    const [attachment] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, id));
    return attachment || undefined;
  }

  async getChatAttachmentsByTenantAndIds(tenantId: string, ids: string[]): Promise<ChatAttachment[]> {
    if (ids.length === 0) return [];
    return db.select().from(chatAttachments).where(
      and(eq(chatAttachments.tenantId, tenantId), inArray(chatAttachments.id, ids))
    );
  }

  async linkChatAttachmentsToMessage(messageId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) return;
    await db.update(chatAttachments)
      .set({ messageId })
      .where(inArray(chatAttachments.id, attachmentIds));
  }

  async upsertChatRead(tenantId: string, userId: string, targetType: "channel" | "dm", targetId: string, lastReadMessageId: string): Promise<{ lastReadAt: Date }> {
    const lastReadAt = new Date();
    if (targetType === "channel") {
      await db.insert(chatReads)
        .values({
          tenantId,
          userId,
          channelId: targetId,
          lastReadMessageId,
          lastReadAt,
        })
        .onConflictDoUpdate({
          target: [chatReads.userId, chatReads.channelId],
          set: {
            lastReadMessageId,
            lastReadAt,
          },
        });
    } else {
      await db.insert(chatReads)
        .values({
          tenantId,
          userId,
          dmThreadId: targetId,
          lastReadMessageId,
          lastReadAt,
        })
        .onConflictDoUpdate({
          target: [chatReads.userId, chatReads.dmThreadId],
          set: {
            lastReadMessageId,
            lastReadAt,
          },
        });
    }
    return { lastReadAt };
  }

  async getChatReadForChannel(userId: string, channelId: string): Promise<{ lastReadMessageId: string | null } | undefined> {
    const [read] = await db.select({ lastReadMessageId: chatReads.lastReadMessageId })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.channelId, channelId)));
    return read;
  }

  async getChatReadForDm(userId: string, dmThreadId: string): Promise<{ lastReadMessageId: string | null } | undefined> {
    const [read] = await db.select({ lastReadMessageId: chatReads.lastReadMessageId })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.dmThreadId, dmThreadId)));
    return read;
  }

  async getUnreadCountForChannel(userId: string, channelId: string): Promise<number> {
    const readRecord = await this.getChatReadForChannel(userId, channelId);
    
    if (!readRecord?.lastReadMessageId) {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt)));
      return result?.count ?? 0;
    }

    const [lastReadMsg] = await db.select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, readRecord.lastReadMessageId));

    if (!lastReadMsg) return 0;

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.channelId, channelId),
        isNull(chatMessages.deletedAt),
        gt(chatMessages.createdAt, lastReadMsg.createdAt)
      ));
    return result?.count ?? 0;
  }

  async getUnreadCountForDm(userId: string, dmThreadId: string): Promise<number> {
    const readRecord = await this.getChatReadForDm(userId, dmThreadId);
    
    if (!readRecord?.lastReadMessageId) {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(eq(chatMessages.dmThreadId, dmThreadId), isNull(chatMessages.deletedAt)));
      return result?.count ?? 0;
    }

    const [lastReadMsg] = await db.select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, readRecord.lastReadMessageId));

    if (!lastReadMsg) return 0;

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.dmThreadId, dmThreadId),
        isNull(chatMessages.deletedAt),
        gt(chatMessages.createdAt, lastReadMsg.createdAt)
      ));
    return result?.count ?? 0;
  }

  async getUnreadCountsForChannels(userId: string, channelIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (channelIds.length === 0) return result;

    const readRecords = await db.select({
      channelId: chatReads.channelId,
      lastReadMessageId: chatReads.lastReadMessageId,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), inArray(chatReads.channelId, channelIds)));

    const readMap = new Map<string, string | null>();
    for (const r of readRecords) {
      if (r.channelId) readMap.set(r.channelId, r.lastReadMessageId);
    }

    const channelsWithNoRead = channelIds.filter(id => !readMap.has(id));
    const channelsWithRead = channelIds.filter(id => readMap.has(id) && readMap.get(id));

    if (channelsWithNoRead.length > 0) {
      const counts = await db.select({
        channelId: chatMessages.channelId,
        count: sql<number>`count(*)::int`,
      })
        .from(chatMessages)
        .where(and(
          inArray(chatMessages.channelId, channelsWithNoRead),
          isNull(chatMessages.deletedAt)
        ))
        .groupBy(chatMessages.channelId);

      for (const c of counts) {
        if (c.channelId) result.set(c.channelId, c.count);
      }
    }

    if (channelsWithRead.length > 0) {
      const lastReadMsgIds = channelsWithRead.map(id => readMap.get(id)!);
      const lastReadMsgs = await db.select({
        id: chatMessages.id,
        createdAt: chatMessages.createdAt,
      })
        .from(chatMessages)
        .where(inArray(chatMessages.id, lastReadMsgIds));

      const msgTimestamps = new Map<string, Date>();
      for (const m of lastReadMsgs) {
        msgTimestamps.set(m.id, m.createdAt);
      }

      for (const channelId of channelsWithRead) {
        const lastReadMsgId = readMap.get(channelId)!;
        const lastReadAt = msgTimestamps.get(lastReadMsgId);
        if (!lastReadAt) {
          result.set(channelId, 0);
          continue;
        }
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.channelId, channelId),
            isNull(chatMessages.deletedAt),
            gt(chatMessages.createdAt, lastReadAt)
          ));
        result.set(channelId, countResult?.count ?? 0);
      }
    }

    for (const id of channelIds) {
      if (!result.has(id)) result.set(id, 0);
    }

    return result;
  }

  async getUnreadCountsForDmThreads(userId: string, threadIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (threadIds.length === 0) return result;

    const readRecords = await db.select({
      dmThreadId: chatReads.dmThreadId,
      lastReadMessageId: chatReads.lastReadMessageId,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), inArray(chatReads.dmThreadId, threadIds)));

    const readMap = new Map<string, string | null>();
    for (const r of readRecords) {
      if (r.dmThreadId) readMap.set(r.dmThreadId, r.lastReadMessageId);
    }

    const threadsWithNoRead = threadIds.filter(id => !readMap.has(id));
    const threadsWithRead = threadIds.filter(id => readMap.has(id) && readMap.get(id));

    if (threadsWithNoRead.length > 0) {
      const counts = await db.select({
        dmThreadId: chatMessages.dmThreadId,
        count: sql<number>`count(*)::int`,
      })
        .from(chatMessages)
        .where(and(
          inArray(chatMessages.dmThreadId, threadsWithNoRead),
          isNull(chatMessages.deletedAt)
        ))
        .groupBy(chatMessages.dmThreadId);

      for (const c of counts) {
        if (c.dmThreadId) result.set(c.dmThreadId, c.count);
      }
    }

    if (threadsWithRead.length > 0) {
      const lastReadMsgIds = threadsWithRead.map(id => readMap.get(id)!);
      const lastReadMsgs = await db.select({
        id: chatMessages.id,
        createdAt: chatMessages.createdAt,
      })
        .from(chatMessages)
        .where(inArray(chatMessages.id, lastReadMsgIds));

      const msgTimestamps = new Map<string, Date>();
      for (const m of lastReadMsgs) {
        msgTimestamps.set(m.id, m.createdAt);
      }

      for (const threadId of threadsWithRead) {
        const lastReadMsgId = readMap.get(threadId)!;
        const lastReadAt = msgTimestamps.get(lastReadMsgId);
        if (!lastReadAt) {
          result.set(threadId, 0);
          continue;
        }
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.dmThreadId, threadId),
            isNull(chatMessages.deletedAt),
            gt(chatMessages.createdAt, lastReadAt)
          ));
        result.set(threadId, countResult?.count ?? 0);
      }
    }

    for (const id of threadIds) {
      if (!result.has(id)) result.set(id, 0);
    }

    return result;
  }

  async getConversationReadReceipts(targetType: "channel" | "dm", targetId: string, tenantId: string): Promise<Array<{ userId: string; lastReadMessageId: string | null; lastReadAt: Date }>> {
    const col = targetType === "channel" ? chatReads.channelId : chatReads.dmThreadId;
    const rows = await db.select({
      userId: chatReads.userId,
      lastReadMessageId: chatReads.lastReadMessageId,
      lastReadAt: chatReads.lastReadAt,
    })
      .from(chatReads)
      .where(and(eq(col, targetId), eq(chatReads.tenantId, tenantId)));
    return rows;
  }

  async getChatDiagnostics(): Promise<{
    nullTenantCounts: {
      channels: number;
      channelMembers: number;
      dmThreads: number;
      dmMembers: number;
      messages: number;
      attachments: number;
    };
    orphanedChannels: number;
    underMemberedDmThreads: number;
  }> {
    const [channelsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatChannels)
      .where(isNull(chatChannels.tenantId));
    
    const [channelMembersNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatChannelMembers)
      .where(isNull(chatChannelMembers.tenantId));
    
    const [dmThreadsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatDmThreads)
      .where(isNull(chatDmThreads.tenantId));
    
    const [dmMembersNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatDmMembers)
      .where(isNull(chatDmMembers.tenantId));
    
    const [messagesNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(isNull(chatMessages.tenantId));
    
    const [attachmentsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatAttachments)
      .where(isNull(chatAttachments.tenantId));

    const orphanedChannelsResult = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM chat_channels c
      WHERE NOT EXISTS (SELECT 1 FROM chat_channel_members m WHERE m.channel_id = c.id)
    `);
    const orphanedChannels = (orphanedChannelsResult.rows[0] as any)?.count ?? 0;

    const underMemberedResult = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM (
        SELECT dm.id, COUNT(m.id) as member_count
        FROM chat_dm_threads dm
        LEFT JOIN chat_dm_members m ON m.dm_thread_id = dm.id
        GROUP BY dm.id
        HAVING COUNT(m.id) < 2
      ) sub
    `);
    const underMemberedDmThreads = (underMemberedResult.rows[0] as any)?.count ?? 0;

    return {
      nullTenantCounts: {
        channels: channelsNull?.count ?? 0,
        channelMembers: channelMembersNull?.count ?? 0,
        dmThreads: dmThreadsNull?.count ?? 0,
        dmMembers: dmMembersNull?.count ?? 0,
        messages: messagesNull?.count ?? 0,
        attachments: attachmentsNull?.count ?? 0,
      },
      orphanedChannels,
      underMemberedDmThreads,
    };
  }

  async createChatExportJob(job: InsertChatExportJob): Promise<ChatExportJob> {
    const [exportJob] = await db.insert(chatExportJobs).values(job).returning();
    return exportJob;
  }

  async getChatExportJob(id: string): Promise<ChatExportJob | undefined> {
    const [exportJob] = await db.select().from(chatExportJobs).where(eq(chatExportJobs.id, id));
    return exportJob || undefined;
  }

  async updateChatExportJob(id: string, updates: Partial<InsertChatExportJob>): Promise<ChatExportJob | undefined> {
    const [updated] = await db.update(chatExportJobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatExportJobs.id, id))
      .returning();
    return updated || undefined;
  }

  async listChatExportJobs(filters?: { status?: string; limit?: number }): Promise<ChatExportJob[]> {
    let query = db.select().from(chatExportJobs).orderBy(desc(chatExportJobs.createdAt));
    
    if (filters?.status) {
      query = query.where(eq(chatExportJobs.status, filters.status)) as any;
    }
    
    const limit = filters?.limit || 20;
    query = query.limit(limit) as any;
    
    return query;
  }

  async getPinnedMessages(channelId: string, tenantId: string): Promise<(ChatPin & { message: ChatMessage & { author: User }; pinnedBy: User })[]> {
    const rows = await db
      .select({
        pin: chatPins,
        message: chatMessages,
        author: users,
      })
      .from(chatPins)
      .innerJoin(chatMessages, eq(chatPins.messageId, chatMessages.id))
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .where(and(eq(chatPins.channelId, channelId), eq(chatPins.tenantId, tenantId)))
      .orderBy(desc(chatPins.createdAt));

    const pinnedByUserIds = [...new Set(rows.map(r => r.pin.pinnedByUserId))];
    const pinnedByUsers = pinnedByUserIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, pinnedByUserIds))
      : [];
    const pinnedByMap = new Map(pinnedByUsers.map(u => [u.id, u]));

    return rows.map(r => ({
      ...r.pin,
      message: { ...r.message, author: r.author },
      pinnedBy: pinnedByMap.get(r.pin.pinnedByUserId)!,
    }));
  }

  async createPin(pin: InsertChatPin): Promise<ChatPin> {
    const [created] = await db.insert(chatPins).values(pin).returning();
    return created;
  }

  async deletePin(channelId: string, messageId: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(chatPins)
      .where(and(
        eq(chatPins.channelId, channelId),
        eq(chatPins.messageId, messageId),
        eq(chatPins.tenantId, tenantId),
      ))
      .returning();
    return result.length > 0;
  }

  async getPin(channelId: string, messageId: string): Promise<ChatPin | undefined> {
    const [pin] = await db.select().from(chatPins)
      .where(and(eq(chatPins.channelId, channelId), eq(chatPins.messageId, messageId)));
    return pin || undefined;
  }

  async getPinCount(channelId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatPins)
      .where(eq(chatPins.channelId, channelId));
    return result?.count ?? 0;
  }
}
