import type { ChatMessage } from "@shared/schema";

export function isUnreadCountableMessage(
  message: Pick<ChatMessage, "authorUserId" | "deletedAt" | "archivedAt" | "parentMessageId">,
  userId: string,
): boolean {
  return (
    message.authorUserId !== userId &&
    message.deletedAt == null &&
    message.archivedAt == null &&
    message.parentMessageId == null
  );
}
