import {
  type User,
  type ChatChannel, type InsertChatChannel,
  type ChatChannelMember, type InsertChatChannelMember,
  type ChatDmThread, type InsertChatDmThread,
  type ChatDmMember,
  type ChatMessage, type InsertChatMessage,
  type ChatAttachment, type InsertChatAttachment,
  type InsertChatMention,
  type InsertChatThreadRead,
  type ChatExportJob, type InsertChatExportJob,
  type ChatMessageReaction,
  type ChatPin, type InsertChatPin,
  users,
  chatChannels, chatChannelMembers,
  chatDmThreads, chatDmMembers,
  chatMessages, chatAttachments, chatReads, chatExportJobs,
  chatMentions, chatThreadReads,
  chatMessageReactions, chatPins,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, inArray, gte, lte, lt, gt, isNull, isNotNull, sql, ilike, or, ne, type SQL } from "drizzle-orm";
export { isUnreadCountableMessage } from "../features/chat/unread";

export class ChatRepository {

  async getChatChannel(id: string): Promise<ChatChannel | undefined> {
    const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.id, id));
    return channel || undefined;
  }

  async getChatChannelsByTenant(tenantId: string): Promise<ChatChannel[]> {
    return db.select().from(chatChannels).where(eq(chatChannels.tenantId, tenantId)).orderBy(asc(chatChannels.name));
  }

  async getPublicChatChannelDirectory(tenantId: string, userId: string): Promise<Array<{
    channel: ChatChannel;
    isMember: boolean;
    memberCount: number;
    lastMessage: { body: string; createdAt: Date; authorName: string | null } | null;
  }>> {
    const channels = await db.select()
      .from(chatChannels)
      .where(and(
        eq(chatChannels.tenantId, tenantId),
        eq(chatChannels.isPrivate, false)
      ))
      .orderBy(asc(chatChannels.name));

    if (channels.length === 0) return [];

    const channelIds = channels.map((channel) => channel.id);

    const memberships = await db.select({
      channelId: chatChannelMembers.channelId,
      userId: chatChannelMembers.userId,
    })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.tenantId, tenantId),
        inArray(chatChannelMembers.channelId, channelIds)
      ));

    const memberCountByChannelId = new Map<string, number>();
    const userChannelIds = new Set<string>();
    for (const membership of memberships) {
      memberCountByChannelId.set(
        membership.channelId,
        (memberCountByChannelId.get(membership.channelId) || 0) + 1
      );
      if (membership.userId === userId) {
        userChannelIds.add(membership.channelId);
      }
    }

    const latestMessageRows = await db.select({
      channelId: chatMessages.channelId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      author: users,
    })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .where(and(
        eq(chatMessages.tenantId, tenantId),
        inArray(chatMessages.channelId, channelIds),
        isNull(chatMessages.parentMessageId),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt)
      ))
      .orderBy(desc(chatMessages.createdAt));

    const latestMessageByChannelId = new Map<string, { body: string; createdAt: Date; authorName: string | null }>();
    for (const row of latestMessageRows) {
      if (!row.channelId || latestMessageByChannelId.has(row.channelId)) continue;
      latestMessageByChannelId.set(row.channelId, {
        body: row.body,
        createdAt: row.createdAt,
        authorName: row.author.name || row.author.email || null,
      });
    }

    return channels.map((channel) => ({
      channel,
      isMember: userChannelIds.has(channel.id),
      memberCount: memberCountByChannelId.get(channel.id) || 0,
      lastMessage: latestMessageByChannelId.get(channel.id) || null,
    }));
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
    
    if (!readRecord?.lastReadAt) {
      const targetColumn = targetType === 'channel' ? chatMessages.channelId : chatMessages.dmThreadId;
      const [firstMsg] = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(
          eq(targetColumn, targetId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
          ne(chatMessages.authorUserId, userId)
        ))
        .orderBy(chatMessages.createdAt)
        .limit(1);
      return firstMsg?.id || null;
    }

    const targetColumn = targetType === 'channel' ? chatMessages.channelId : chatMessages.dmThreadId;
    const [firstUnread] = await db.select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(
        eq(targetColumn, targetId),
        gt(chatMessages.createdAt, readRecord.lastReadAt),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt),
        isNull(chatMessages.parentMessageId),
        ne(chatMessages.authorUserId, userId)
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

  async getThreadReplies(parentMessageId: string, limit = 100): Promise<(ChatMessage & { author: User; attachments?: ChatAttachment[]; reactions?: (ChatMessageReaction & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> })[] })[]> {
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
    const replyIds = replies.map(reply => reply.id);
    const attachmentRows = replyIds.length > 0
      ? await db.select().from(chatAttachments).where(inArray(chatAttachments.messageId, replyIds))
      : [];
    const reactionsMap = await this.getReactionsForMessages(replyIds);
    const attachmentsByMessageId = new Map<string, ChatAttachment[]>();
    for (const attachment of attachmentRows) {
      if (!attachment.messageId) continue;
      const existing = attachmentsByMessageId.get(attachment.messageId) || [];
      existing.push(attachment);
      attachmentsByMessageId.set(attachment.messageId, existing);
    }

    return replies
      .map(m => ({
        ...m,
        author: authorMap.get(m.authorUserId)!,
        attachments: attachmentsByMessageId.get(m.id) || [],
        reactions: reactionsMap.get(m.id) || [],
      }))
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

  async getThreadSummariesForConversation(targetType: 'channel' | 'dm', targetId: string, tenantId?: string, userId?: string): Promise<Map<string, {
    replyCount: number;
    unreadReplyCount: number;
    lastReplyAt: Date | null;
    lastReplyAuthorId: string | null;
    lastReplyAuthor: Pick<User, "id" | "name" | "email" | "avatarUrl"> | null;
    lastReplyBody: string | null;
    participants: Array<Pick<User, "id" | "name" | "email" | "avatarUrl">>;
  }>> {
    const summaries = new Map<string, {
      replyCount: number;
      unreadReplyCount: number;
      lastReplyAt: Date | null;
      lastReplyAuthorId: string | null;
      lastReplyAuthor: Pick<User, "id" | "name" | "email" | "avatarUrl"> | null;
      lastReplyBody: string | null;
      participants: Array<Pick<User, "id" | "name" | "email" | "avatarUrl">>;
    }>();

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

    const unreadCountByParentId = new Map<string, number>();
    if (tenantId && userId && parentIds.length > 0) {
      const unreadRows = await db.select({
        parentMessageId: chatMessages.parentMessageId,
        count: sql<number>`count(*)::int`,
      })
        .from(chatMessages)
        .leftJoin(chatThreadReads, and(
          eq(chatThreadReads.parentMessageId, chatMessages.parentMessageId),
          eq(chatThreadReads.userId, userId),
          eq(chatThreadReads.tenantId, tenantId)
        ))
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          inArray(chatMessages.parentMessageId, parentIds),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          ne(chatMessages.authorUserId, userId),
          or(
            isNull(chatThreadReads.lastReadAt),
            gt(chatMessages.createdAt, chatThreadReads.lastReadAt)
          )!
        ))
        .groupBy(chatMessages.parentMessageId);

      for (const row of unreadRows) {
        if (row.parentMessageId) unreadCountByParentId.set(row.parentMessageId, Number(row.count || 0));
      }
    }

    const replyAuthorRows = await db.select({
      parentMessageId: chatMessages.parentMessageId,
      body: chatMessages.body,
      authorUserId: chatMessages.authorUserId,
      createdAt: chatMessages.createdAt,
      author: users,
    })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .where(and(
        inArray(chatMessages.parentMessageId, parentIds),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt)
      ))
      .orderBy(desc(chatMessages.createdAt));

    const lastReplyByParentId = new Map<string, typeof replyAuthorRows[number]>();
    const participantsByParentId = new Map<string, Array<Pick<User, "id" | "name" | "email" | "avatarUrl">>>();
    const participantIdsByParentId = new Map<string, Set<string>>();

    for (const row of replyAuthorRows) {
      if (!row.parentMessageId) continue;
      if (!lastReplyByParentId.has(row.parentMessageId)) {
        lastReplyByParentId.set(row.parentMessageId, row);
      }

      const participantIds = participantIdsByParentId.get(row.parentMessageId) || new Set<string>();
      const participants = participantsByParentId.get(row.parentMessageId) || [];
      if (!participantIds.has(row.author.id) && participants.length < 3) {
        participantIds.add(row.author.id);
        participants.push({
          id: row.author.id,
          name: row.author.name,
          email: row.author.email,
          avatarUrl: row.author.avatarUrl,
        });
        participantIdsByParentId.set(row.parentMessageId, participantIds);
        participantsByParentId.set(row.parentMessageId, participants);
      }
    }

    for (const stat of replyStats) {
      if (!stat.parentMessageId) continue;
      const lastReply = lastReplyByParentId.get(stat.parentMessageId);

      summaries.set(stat.parentMessageId, {
        replyCount: Number(stat.count),
        unreadReplyCount: unreadCountByParentId.get(stat.parentMessageId) || 0,
        lastReplyAt: stat.lastReplyAt,
        lastReplyAuthorId: lastReply?.authorUserId || null,
        lastReplyAuthor: lastReply?.author
          ? {
            id: lastReply.author.id,
            name: lastReply.author.name,
            email: lastReply.author.email,
            avatarUrl: lastReply.author.avatarUrl,
          }
          : null,
        lastReplyBody: lastReply?.body || null,
        participants: participantsByParentId.get(stat.parentMessageId) || [],
      });
    }

    return summaries;
  }

  async getChatThreadInboxForUser(tenantId: string, userId: string, limit = 50): Promise<Array<{
    parentMessage: ChatMessage & { author: Pick<User, "id" | "name" | "email" | "avatarUrl"> };
    channel: Pick<ChatChannel, "id" | "name" | "isPrivate"> | null;
    dmThread: { id: string; members: Array<{ userId: string; user: Pick<User, "id" | "name" | "email" | "avatarUrl"> }> } | null;
    replyCount: number;
    unreadReplyCount: number;
    lastReplyAt: Date | null;
    lastReplyAuthor: Pick<User, "id" | "name" | "email" | "avatarUrl"> | null;
  }>> {
    const accessibleChannelIds = (await this.getUserChatChannels(tenantId, userId)).map(m => m.channelId);
    const accessibleDmIds = (await this.getUserChatDmThreads(tenantId, userId)).map(dm => dm.id);
    if (accessibleChannelIds.length === 0 && accessibleDmIds.length === 0) return [];

    const accessConditions: SQL[] = [];
    if (accessibleChannelIds.length > 0) {
      accessConditions.push(inArray(chatMessages.channelId, accessibleChannelIds));
    }
    if (accessibleDmIds.length > 0) {
      accessConditions.push(inArray(chatMessages.dmThreadId, accessibleDmIds));
    }

    const baseMessageConditions = [
      eq(chatMessages.tenantId, tenantId),
      isNull(chatMessages.deletedAt),
      isNull(chatMessages.archivedAt),
      or(...accessConditions)!,
    ];

    const ownParentRows = await db.select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(
        ...baseMessageConditions,
        isNull(chatMessages.parentMessageId),
        eq(chatMessages.authorUserId, userId)
      ));

    const participatedReplyRows = await db.select({ parentMessageId: chatMessages.parentMessageId })
      .from(chatMessages)
      .where(and(
        ...baseMessageConditions,
        isNotNull(chatMessages.parentMessageId),
        eq(chatMessages.authorUserId, userId)
      ));

    const mentionedRows = await db.select({ message: chatMessages })
      .from(chatMentions)
      .innerJoin(chatMessages, eq(chatMentions.messageId, chatMessages.id))
      .where(and(
        eq(chatMentions.tenantId, tenantId),
        eq(chatMentions.mentionedUserId, userId),
        ...baseMessageConditions
      ));

    const parentIdSet = new Set<string>();
    ownParentRows.forEach(row => parentIdSet.add(row.id));
    participatedReplyRows.forEach(row => {
      if (row.parentMessageId) parentIdSet.add(row.parentMessageId);
    });
    mentionedRows.forEach(row => {
      parentIdSet.add(row.message.parentMessageId || row.message.id);
    });

    const candidateParentIds = [...parentIdSet];
    if (candidateParentIds.length === 0) return [];

    const replyStats = await db.select({
      parentMessageId: chatMessages.parentMessageId,
      count: sql<number>`count(*)::int`,
      lastReplyAt: sql<Date>`max(${chatMessages.createdAt})`,
    })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.tenantId, tenantId),
        inArray(chatMessages.parentMessageId, candidateParentIds),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt)
      ))
      .groupBy(chatMessages.parentMessageId);

    const statsByParentId = new Map(
      replyStats
        .filter(stat => stat.parentMessageId)
        .map(stat => [stat.parentMessageId!, {
          replyCount: Number(stat.count || 0),
          lastReplyAt: stat.lastReplyAt,
        }])
    );
    const threadParentIds = candidateParentIds.filter(id => (statsByParentId.get(id)?.replyCount || 0) > 0);
    if (threadParentIds.length === 0) return [];

    const unreadRows = await db.select({
      parentMessageId: chatMessages.parentMessageId,
      count: sql<number>`count(*)::int`,
    })
      .from(chatMessages)
      .leftJoin(chatThreadReads, and(
        eq(chatThreadReads.parentMessageId, chatMessages.parentMessageId),
        eq(chatThreadReads.userId, userId),
        eq(chatThreadReads.tenantId, tenantId)
      ))
      .where(and(
        eq(chatMessages.tenantId, tenantId),
        inArray(chatMessages.parentMessageId, threadParentIds),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt),
        ne(chatMessages.authorUserId, userId),
        or(
          isNull(chatThreadReads.lastReadAt),
          gt(chatMessages.createdAt, chatThreadReads.lastReadAt)
        )!
      ))
      .groupBy(chatMessages.parentMessageId);
    const unreadCountByParentId = new Map(
      unreadRows
        .filter(row => row.parentMessageId)
        .map(row => [row.parentMessageId!, Number(row.count || 0)])
    );

    const parentRows = await db.select({
      message: chatMessages,
      author: users,
      channel: chatChannels,
    })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .leftJoin(chatChannels, eq(chatMessages.channelId, chatChannels.id))
      .where(and(
        ...baseMessageConditions,
        isNull(chatMessages.parentMessageId),
        inArray(chatMessages.id, threadParentIds)
      ));

    const lastReplyRows = await db.select({
      parentMessageId: chatMessages.parentMessageId,
      author: users,
      createdAt: chatMessages.createdAt,
    })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .where(and(
        eq(chatMessages.tenantId, tenantId),
        inArray(chatMessages.parentMessageId, threadParentIds),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt)
      ))
      .orderBy(desc(chatMessages.createdAt));

    const lastReplyAuthorByParentId = new Map<string, Pick<User, "id" | "name" | "email" | "avatarUrl">>();
    for (const row of lastReplyRows) {
      if (!row.parentMessageId || lastReplyAuthorByParentId.has(row.parentMessageId)) continue;
      lastReplyAuthorByParentId.set(row.parentMessageId, {
        id: row.author.id,
        name: row.author.name,
        email: row.author.email,
        avatarUrl: row.author.avatarUrl,
      });
    }

    const dmThreadIds = [...new Set(parentRows.map(r => r.message.dmThreadId).filter(Boolean) as string[])];
    const dmMembers = dmThreadIds.length > 0
      ? await db.select({ member: chatDmMembers, user: users })
        .from(chatDmMembers)
        .innerJoin(users, eq(chatDmMembers.userId, users.id))
        .where(inArray(chatDmMembers.dmThreadId, dmThreadIds))
      : [];

    return parentRows
      .map(row => {
        const stats = statsByParentId.get(row.message.id);
        return {
          parentMessage: {
            ...row.message,
            author: {
              id: row.author.id,
              name: row.author.name,
              email: row.author.email,
              avatarUrl: row.author.avatarUrl,
            },
          },
          channel: row.channel
            ? { id: row.channel.id, name: row.channel.name, isPrivate: row.channel.isPrivate }
            : null,
          dmThread: row.message.dmThreadId
            ? {
              id: row.message.dmThreadId,
              members: dmMembers
                .filter(({ member }) => member.dmThreadId === row.message.dmThreadId)
                .map(({ member, user }) => ({
                  userId: member.userId,
                  user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                  },
                })),
            }
            : null,
          replyCount: stats?.replyCount || 0,
          unreadReplyCount: unreadCountByParentId.get(row.message.id) || 0,
          lastReplyAt: stats?.lastReplyAt || null,
          lastReplyAuthor: lastReplyAuthorByParentId.get(row.message.id) || null,
        };
      })
      .sort((a, b) => new Date(b.lastReplyAt || 0).getTime() - new Date(a.lastReplyAt || 0).getTime())
      .slice(0, limit);
  }

  async upsertChatThreadRead(tenantId: string, userId: string, parentMessageId: string, lastReadReplyId: string | null): Promise<{ lastReadAt: Date }> {
    const lastReadAt = new Date();
    const values: InsertChatThreadRead = {
      tenantId,
      userId,
      parentMessageId,
      lastReadReplyId,
    };

    await db.insert(chatThreadReads)
      .values({ ...values, lastReadAt })
      .onConflictDoUpdate({
        target: [chatThreadReads.userId, chatThreadReads.parentMessageId],
        set: {
          lastReadReplyId,
          lastReadAt,
        },
      });

    return { lastReadAt };
  }

  async markAllChatThreadsReadForUser(tenantId: string, userId: string): Promise<{
    threads: Array<{ parentMessageId: string; lastReadReplyId: string; lastReadAt: Date }>;
  }> {
    const marked = {
      threads: [] as Array<{ parentMessageId: string; lastReadReplyId: string; lastReadAt: Date }>,
    };

    const inboxThreads = await this.getChatThreadInboxForUser(tenantId, userId, 100);
    const unreadParentIds = inboxThreads
      .filter((thread) => thread.unreadReplyCount > 0)
      .map((thread) => thread.parentMessage.id);

    for (const parentMessageId of unreadParentIds) {
      const [latestReply] = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          eq(chatMessages.parentMessageId, parentMessageId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      if (!latestReply?.id) continue;

      const result = await this.upsertChatThreadRead(tenantId, userId, parentMessageId, latestReply.id);
      marked.threads.push({
        parentMessageId,
        lastReadReplyId: latestReply.id,
        lastReadAt: result.lastReadAt,
      });
    }

    return marked;
  }

  async getChatThreadReadStateForUser(tenantId: string, userId: string, parentMessageId: string): Promise<{
    unreadReplyCount: number;
    firstUnreadReplyId: string | null;
    lastReadAt: Date | null;
  }> {
    const [read] = await db.select()
      .from(chatThreadReads)
      .where(and(
        eq(chatThreadReads.tenantId, tenantId),
        eq(chatThreadReads.userId, userId),
        eq(chatThreadReads.parentMessageId, parentMessageId)
      ))
      .limit(1);

    const unreadConditions: SQL[] = [
      eq(chatMessages.tenantId, tenantId),
      eq(chatMessages.parentMessageId, parentMessageId),
      isNull(chatMessages.deletedAt),
      isNull(chatMessages.archivedAt),
      ne(chatMessages.authorUserId, userId),
    ];
    if (read?.lastReadAt) {
      unreadConditions.push(gt(chatMessages.createdAt, read.lastReadAt));
    }

    const [countRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(...unreadConditions));

    const [firstUnread] = await db.select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(...unreadConditions))
      .orderBy(asc(chatMessages.createdAt))
      .limit(1);

    return {
      unreadReplyCount: Number(countRow?.count || 0),
      firstUnreadReplyId: firstUnread?.id || null,
      lastReadAt: read?.lastReadAt || null,
    };
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

  async createChatMentions(mentions: InsertChatMention[]): Promise<void> {
    if (mentions.length === 0) return;
    await db.insert(chatMentions).values(mentions);
  }

  async getChatMentionsForUser(tenantId: string, userId: string, limit = 50): Promise<Array<{
    id: string;
    createdAt: Date;
    message: ChatMessage & { author: Pick<User, "id" | "name" | "email" | "avatarUrl"> };
    channel: Pick<ChatChannel, "id" | "name" | "isPrivate"> | null;
    dmThread: { id: string; members: Array<{ userId: string; user: Pick<User, "id" | "name" | "email" | "avatarUrl"> }> } | null;
  }>> {
    const accessibleChannelIds = (await this.getUserChatChannels(tenantId, userId)).map(m => m.channelId);
    const accessibleDmIds = (await this.getUserChatDmThreads(tenantId, userId)).map(dm => dm.id);
    if (accessibleChannelIds.length === 0 && accessibleDmIds.length === 0) return [];

    const accessConditions: SQL[] = [];
    if (accessibleChannelIds.length > 0) {
      accessConditions.push(inArray(chatMessages.channelId, accessibleChannelIds));
    }
    if (accessibleDmIds.length > 0) {
      accessConditions.push(inArray(chatMessages.dmThreadId, accessibleDmIds));
    }

    const rows = await db.select({
      mention: chatMentions,
      message: chatMessages,
      author: users,
      channel: chatChannels,
    })
      .from(chatMentions)
      .innerJoin(chatMessages, eq(chatMentions.messageId, chatMessages.id))
      .innerJoin(users, eq(chatMessages.authorUserId, users.id))
      .leftJoin(chatChannels, eq(chatMessages.channelId, chatChannels.id))
      .where(and(
        eq(chatMentions.tenantId, tenantId),
        eq(chatMentions.mentionedUserId, userId),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt),
        or(...accessConditions)!
      ))
      .orderBy(desc(chatMentions.createdAt))
      .limit(limit);

    const dmThreadIds = [...new Set(rows.map(r => r.message.dmThreadId).filter(Boolean) as string[])];
    const dmMembers = dmThreadIds.length > 0
      ? await db.select({ member: chatDmMembers, user: users })
        .from(chatDmMembers)
        .innerJoin(users, eq(chatDmMembers.userId, users.id))
        .where(inArray(chatDmMembers.dmThreadId, dmThreadIds))
      : [];

    return rows.map(row => ({
      id: row.mention.id,
      createdAt: row.mention.createdAt,
      message: {
        ...row.message,
        author: {
          id: row.author.id,
          name: row.author.name,
          email: row.author.email,
          avatarUrl: row.author.avatarUrl,
        },
      },
      channel: row.channel
        ? { id: row.channel.id, name: row.channel.name, isPrivate: row.channel.isPrivate }
        : null,
      dmThread: row.message.dmThreadId
        ? {
          id: row.message.dmThreadId,
          members: dmMembers
            .filter(({ member }) => member.dmThreadId === row.message.dmThreadId)
            .map(({ member, user }) => ({
              userId: member.userId,
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
              },
            })),
        }
        : null,
    }));
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

  async markAllChatReadForUser(tenantId: string, userId: string): Promise<{
    channels: Array<{ targetId: string; lastReadMessageId: string; lastReadAt: Date }>;
    dmThreads: Array<{ targetId: string; lastReadMessageId: string; lastReadAt: Date }>;
  }> {
    const marked = {
      channels: [] as Array<{ targetId: string; lastReadMessageId: string; lastReadAt: Date }>,
      dmThreads: [] as Array<{ targetId: string; lastReadMessageId: string; lastReadAt: Date }>,
    };

    const memberships = await this.getUserChatChannels(tenantId, userId);
    for (const membership of memberships) {
      const [latest] = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          eq(chatMessages.channelId, membership.channelId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      if (!latest?.id) continue;
      const result = await this.upsertChatRead(tenantId, userId, "channel", membership.channelId, latest.id);
      marked.channels.push({ targetId: membership.channelId, lastReadMessageId: latest.id, lastReadAt: result.lastReadAt });
    }

    const dmThreads = await this.getUserChatDmThreads(tenantId, userId);
    for (const thread of dmThreads) {
      const [latest] = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          eq(chatMessages.dmThreadId, thread.id),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      if (!latest?.id) continue;
      const result = await this.upsertChatRead(tenantId, userId, "dm", thread.id, latest.id);
      marked.dmThreads.push({ targetId: thread.id, lastReadMessageId: latest.id, lastReadAt: result.lastReadAt });
    }

    return marked;
  }

  async getChatReadForChannel(userId: string, channelId: string): Promise<{ lastReadMessageId: string | null; lastReadAt: Date | null } | undefined> {
    const [read] = await db.select({
      lastReadMessageId: chatReads.lastReadMessageId,
      lastReadAt: chatReads.lastReadAt,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.channelId, channelId)));
    return read;
  }

  async getChatReadForDm(userId: string, dmThreadId: string): Promise<{ lastReadMessageId: string | null; lastReadAt: Date | null } | undefined> {
    const [read] = await db.select({
      lastReadMessageId: chatReads.lastReadMessageId,
      lastReadAt: chatReads.lastReadAt,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.dmThreadId, dmThreadId)));
    return read;
  }

  async getUnreadCountForChannel(userId: string, channelId: string): Promise<number> {
    const readRecord = await this.getChatReadForChannel(userId, channelId);
    
    if (!readRecord?.lastReadAt) {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.channelId, channelId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
          ne(chatMessages.authorUserId, userId)
        ));
      return result?.count ?? 0;
    }

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.channelId, channelId),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt),
        isNull(chatMessages.parentMessageId),
        ne(chatMessages.authorUserId, userId),
        gt(chatMessages.createdAt, readRecord.lastReadAt)
      ));
    return result?.count ?? 0;
  }

  async getUnreadCountForDm(userId: string, dmThreadId: string): Promise<number> {
    const readRecord = await this.getChatReadForDm(userId, dmThreadId);
    
    if (!readRecord?.lastReadAt) {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.dmThreadId, dmThreadId),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
          ne(chatMessages.authorUserId, userId)
        ));
      return result?.count ?? 0;
    }

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.dmThreadId, dmThreadId),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.archivedAt),
        isNull(chatMessages.parentMessageId),
        ne(chatMessages.authorUserId, userId),
        gt(chatMessages.createdAt, readRecord.lastReadAt)
      ));
    return result?.count ?? 0;
  }

  async getUnreadCountsForChannels(userId: string, channelIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (channelIds.length === 0) return result;

    const readRecords = await db.select({
      channelId: chatReads.channelId,
      lastReadAt: chatReads.lastReadAt,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), inArray(chatReads.channelId, channelIds)));

    const readMap = new Map<string, Date | null>();
    for (const r of readRecords) {
      if (r.channelId) readMap.set(r.channelId, r.lastReadAt);
    }

    const channelsWithNoRead = channelIds.filter(id => !readMap.get(id));
    const channelsWithRead = channelIds.filter(id => Boolean(readMap.get(id)));

    if (channelsWithNoRead.length > 0) {
      const counts = await db.select({
        channelId: chatMessages.channelId,
        count: sql<number>`count(*)::int`,
      })
        .from(chatMessages)
        .where(and(
          inArray(chatMessages.channelId, channelsWithNoRead),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
          ne(chatMessages.authorUserId, userId)
        ))
        .groupBy(chatMessages.channelId);

      for (const c of counts) {
        if (c.channelId) result.set(c.channelId, c.count);
      }
    }

    if (channelsWithRead.length > 0) {
      for (const channelId of channelsWithRead) {
        const lastReadAt = readMap.get(channelId)!;
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.channelId, channelId),
            isNull(chatMessages.deletedAt),
            isNull(chatMessages.archivedAt),
            isNull(chatMessages.parentMessageId),
            ne(chatMessages.authorUserId, userId),
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
      lastReadAt: chatReads.lastReadAt,
    })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), inArray(chatReads.dmThreadId, threadIds)));

    const readMap = new Map<string, Date | null>();
    for (const r of readRecords) {
      if (r.dmThreadId) readMap.set(r.dmThreadId, r.lastReadAt);
    }

    const threadsWithNoRead = threadIds.filter(id => !readMap.get(id));
    const threadsWithRead = threadIds.filter(id => Boolean(readMap.get(id)));

    if (threadsWithNoRead.length > 0) {
      const counts = await db.select({
        dmThreadId: chatMessages.dmThreadId,
        count: sql<number>`count(*)::int`,
      })
        .from(chatMessages)
        .where(and(
          inArray(chatMessages.dmThreadId, threadsWithNoRead),
          isNull(chatMessages.deletedAt),
          isNull(chatMessages.archivedAt),
          isNull(chatMessages.parentMessageId),
          ne(chatMessages.authorUserId, userId)
        ))
        .groupBy(chatMessages.dmThreadId);

      for (const c of counts) {
        if (c.dmThreadId) result.set(c.dmThreadId, c.count);
      }
    }

    if (threadsWithRead.length > 0) {
      for (const threadId of threadsWithRead) {
        const lastReadAt = readMap.get(threadId)!;
        const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.dmThreadId, threadId),
            isNull(chatMessages.deletedAt),
            isNull(chatMessages.archivedAt),
            isNull(chatMessages.parentMessageId),
            ne(chatMessages.authorUserId, userId),
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
