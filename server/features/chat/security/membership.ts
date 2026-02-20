import { db } from "../../../db";
import { eq, and } from "drizzle-orm";
import {
  chatChannels, chatChannelMembers,
  chatDmThreads, chatDmMembers,
  chatMessages,
} from "@shared/schema";
import { AppError } from "../../../lib/errors";

export interface MessageContainer {
  type: "channel" | "dm";
  id: string;
  tenantId: string;
}

export async function requireChannelMember(
  tenantId: string,
  userId: string,
  channelId: string
): Promise<void> {
  const [channel] = await db
    .select({ id: chatChannels.id, tenantId: chatChannels.tenantId, isPrivate: chatChannels.isPrivate })
    .from(chatChannels)
    .where(and(eq(chatChannels.id, channelId), eq(chatChannels.tenantId, tenantId)));

  if (!channel) {
    throw AppError.notFound("Channel not found");
  }

  if (!channel.isPrivate) {
    return;
  }

  const [member] = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.userId, userId),
        eq(chatChannelMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw AppError.notFound("Channel not found");
  }
}

export async function requireChannelMemberStrict(
  tenantId: string,
  userId: string,
  channelId: string
): Promise<void> {
  const [channel] = await db
    .select({ id: chatChannels.id, tenantId: chatChannels.tenantId })
    .from(chatChannels)
    .where(and(eq(chatChannels.id, channelId), eq(chatChannels.tenantId, tenantId)));

  if (!channel) {
    throw AppError.notFound("Channel not found");
  }

  const [member] = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.userId, userId),
        eq(chatChannelMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw AppError.forbidden("Not a member of this channel");
  }
}

export async function requireDmMember(
  tenantId: string,
  userId: string,
  dmThreadId: string
): Promise<void> {
  const [thread] = await db
    .select({ id: chatDmThreads.id, tenantId: chatDmThreads.tenantId })
    .from(chatDmThreads)
    .where(and(eq(chatDmThreads.id, dmThreadId), eq(chatDmThreads.tenantId, tenantId)));

  if (!thread) {
    throw AppError.notFound("DM thread not found");
  }

  const [member] = await db
    .select({ userId: chatDmMembers.userId })
    .from(chatDmMembers)
    .where(
      and(
        eq(chatDmMembers.dmThreadId, dmThreadId),
        eq(chatDmMembers.userId, userId),
        eq(chatDmMembers.tenantId, tenantId)
      )
    );

  if (!member) {
    throw AppError.notFound("DM thread not found");
  }
}

export async function resolveMessageContainer(
  messageId: string,
  tenantId: string
): Promise<MessageContainer> {
  const [message] = await db
    .select({
      id: chatMessages.id,
      tenantId: chatMessages.tenantId,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, tenantId)));

  if (!message) {
    throw AppError.notFound("Message not found");
  }

  if (message.channelId) {
    return { type: "channel", id: message.channelId, tenantId: message.tenantId };
  }
  if (message.dmThreadId) {
    return { type: "dm", id: message.dmThreadId, tenantId: message.tenantId };
  }

  throw AppError.notFound("Message not found");
}

export async function requireMessageAccess(
  tenantId: string,
  userId: string,
  messageId: string
): Promise<MessageContainer> {
  const container = await resolveMessageContainer(messageId, tenantId);

  if (container.type === "channel") {
    await requireChannelMember(tenantId, userId, container.id);
  } else {
    await requireDmMember(tenantId, userId, container.id);
  }

  return container;
}
