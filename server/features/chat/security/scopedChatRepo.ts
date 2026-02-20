import { storage } from "../../../storage";
import { AppError } from "../../../lib/errors";
import {
  requireChannelMember,
  requireChannelMemberStrict,
  requireDmMember,
  requireMessageAccess,
  resolveMessageContainer,
  type MessageContainer,
} from "./membership";
import { logSecurityEvent, type ChatContext } from "./chatPolicy";

export class ScopedChatRepo {
  constructor(
    private readonly tenantId: string,
    private readonly userId: string
  ) {}

  get ctx(): ChatContext {
    return { tenantId: this.tenantId, userId: this.userId };
  }

  async getChannelScoped(channelId: string) {
    const channel = await storage.getChatChannel(channelId);
    if (!channel || channel.tenantId !== this.tenantId) {
      throw AppError.notFound("Channel not found");
    }
    return channel;
  }

  async getChannelWithMemberCheck(channelId: string) {
    await requireChannelMember(this.tenantId, this.userId, channelId);
    return this.getChannelScoped(channelId);
  }

  async getChannelWithStrictMemberCheck(channelId: string) {
    const channel = await this.getChannelScoped(channelId);
    await requireChannelMemberStrict(this.tenantId, this.userId, channelId);
    return channel;
  }

  async listChannels() {
    return storage.getChatChannelsByTenant(this.tenantId);
  }

  async listMyChannels() {
    return storage.getUserChatChannels(this.tenantId, this.userId);
  }

  async getChannelMembers(channelId: string) {
    await requireChannelMember(this.tenantId, this.userId, channelId);
    return storage.getChatChannelMembers(channelId);
  }

  async listChannelMessages(channelId: string, limit?: number, before?: Date, after?: Date) {
    await requireChannelMember(this.tenantId, this.userId, channelId);
    return storage.getChatMessages("channel", channelId, limit, before, after);
  }

  async getDmThreadScoped(dmId: string) {
    const thread = await storage.getChatDmThread(dmId);
    if (!thread || thread.tenantId !== this.tenantId) {
      throw AppError.notFound("DM thread not found");
    }
    return thread;
  }

  async getDmThreadWithMemberCheck(dmId: string) {
    await requireDmMember(this.tenantId, this.userId, dmId);
    return this.getDmThreadScoped(dmId);
  }

  async listMyDmThreads() {
    return storage.getUserChatDmThreads(this.tenantId, this.userId);
  }

  async listDmMessages(dmId: string, limit?: number, before?: Date, after?: Date) {
    await requireDmMember(this.tenantId, this.userId, dmId);
    return storage.getChatMessages("dm", dmId, limit, before, after);
  }

  async getMessageScoped(messageId: string) {
    const message = await storage.getChatMessage(messageId);
    if (!message || message.tenantId !== this.tenantId) {
      throw AppError.notFound("Message not found");
    }
    return message;
  }

  async getMessageWithAccessCheck(messageId: string): Promise<{
    message: NonNullable<Awaited<ReturnType<typeof storage.getChatMessage>>>;
    container: MessageContainer;
  }> {
    const container = await requireMessageAccess(this.tenantId, this.userId, messageId);
    const message = await this.getMessageScoped(messageId);
    return { message, container };
  }

  async requireMessageOwnership(messageId: string) {
    const { message, container } = await this.getMessageWithAccessCheck(messageId);
    if (message.authorUserId !== this.userId) {
      throw AppError.forbidden("Can only modify your own messages");
    }
    return { message, container };
  }

  async getReactionsScoped(messageId: string) {
    await requireMessageAccess(this.tenantId, this.userId, messageId);
    return storage.getReactionsForMessage(messageId);
  }

  async addReactionScoped(messageId: string, emoji: string) {
    const { message } = await this.getMessageWithAccessCheck(messageId);
    if (message.deletedAt) {
      throw AppError.badRequest("Cannot react to a deleted message");
    }
    return storage.addReaction(this.tenantId, messageId, this.userId, emoji);
  }

  async removeReactionScoped(messageId: string, emoji: string) {
    await requireMessageAccess(this.tenantId, this.userId, messageId);
    return storage.removeReaction(this.tenantId, messageId, this.userId, emoji);
  }

  async getPinsScoped(channelId: string) {
    await requireChannelMember(this.tenantId, this.userId, channelId);
    return storage.getPinnedMessages(channelId, this.tenantId);
  }

  async getThreadSummariesScoped(targetType: "channel" | "dm", targetId: string) {
    if (targetType === "channel") {
      await requireChannelMember(this.tenantId, this.userId, targetId);
    } else {
      await requireDmMember(this.tenantId, this.userId, targetId);
    }
    return storage.getThreadSummariesForConversation(targetType, targetId);
  }

  async getFirstUnreadScoped(targetType: "channel" | "dm", targetId: string) {
    if (targetType === "channel") {
      await requireChannelMember(this.tenantId, this.userId, targetId);
    } else {
      await requireDmMember(this.tenantId, this.userId, targetId);
    }
    return storage.getFirstUnreadMessageId(targetType, targetId, this.userId);
  }
}

export function createScopedChatRepo(tenantId: string, userId: string): ScopedChatRepo {
  return new ScopedChatRepo(tenantId, userId);
}
