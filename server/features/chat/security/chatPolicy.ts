import { Request } from "express";
import { AppError } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { getCurrentUserId } from "../../../middleware/authContext";
import { storage } from "../../../storage";
import { log } from "../../../lib/log";

export interface ChatContext {
  tenantId: string;
  userId: string;
}

export function extractChatContext(req: Request): ChatContext {
  const tenantId = getEffectiveTenantId(req);
  const userId = getCurrentUserId(req);

  if (!tenantId) {
    throw AppError.forbidden("Tenant context required");
  }

  return { tenantId, userId };
}

export async function isChatAdmin(tenantId: string, userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user || user.tenantId !== tenantId) return false;
  return user.role === "admin" || user.role === "super_admin";
}

export async function isChannelOwner(channelId: string, userId: string): Promise<boolean> {
  const channel = await storage.getChatChannel(channelId);
  return channel?.createdBy === userId;
}

export function logSecurityEvent(
  event: string,
  ctx: ChatContext,
  details: Record<string, unknown> = {}
): void {
  log(
    `[chat-security] ${event} | tenant=${ctx.tenantId} user=${ctx.userId} ${Object.entries(details).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    "security"
  );
}
