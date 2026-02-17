import type { Socket } from "socket.io";
import { log } from "../lib/log";
import { storage } from "../storage";
import { parseConversationId } from "./typing";

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string | null;
}

interface SocketPolicyOptions {
  requireAuth?: boolean;
  requireTenant?: boolean;
  requireChatMembership?: boolean;
}

export interface AuthorizedContext {
  userId: string;
  tenantId: string;
  socketId: string;
}

type PolicyHandler<TPayload = any> = (
  ctx: AuthorizedContext,
  payload: TPayload,
  socket: AuthenticatedSocket
) => void | Promise<void>;

export function withSocketPolicy<TPayload = any>(
  socket: AuthenticatedSocket,
  options: SocketPolicyOptions,
  handler: PolicyHandler<TPayload>
): (payload: TPayload) => Promise<void> {
  const {
    requireAuth = true,
    requireTenant = true,
    requireChatMembership = false,
  } = options;

  return async (payload: TPayload) => {
    const userId = socket.userId;
    const tenantId = socket.tenantId;

    if (requireAuth && !userId) {
      log(`[socketPolicy] Denied: not authenticated (socket=${socket.id})`, "socket.io");
      return;
    }

    if (requireTenant && !tenantId) {
      log(`[socketPolicy] Denied: no tenant context (socket=${socket.id}, user=${userId})`, "socket.io");
      return;
    }

    const ctx: AuthorizedContext = {
      userId: userId!,
      tenantId: tenantId!,
      socketId: socket.id,
    };

    if (requireChatMembership) {
      const conversationId = (payload as any)?.conversationId;
      if (!conversationId || typeof conversationId !== "string") {
        log(`[socketPolicy] Denied: missing conversationId (socket=${socket.id})`, "socket.io");
        return;
      }

      const parsed = parseConversationId(conversationId);
      if (!parsed) {
        log(`[socketPolicy] Denied: invalid conversationId=${conversationId} (socket=${socket.id})`, "socket.io");
        return;
      }

      try {
        let isMember = false;
        if (parsed.type === "channel") {
          isMember = await storage.isUserInChatChannel(ctx.userId, parsed.id);
        } else {
          const userDmThreads = await storage.getUserChatDmThreads(ctx.tenantId, ctx.userId);
          isMember = userDmThreads.some((t) => t.id === parsed.id);
        }

        if (!isMember) {
          log(`[socketPolicy] Denied: not a member of ${conversationId} (socket=${socket.id}, user=${ctx.userId})`, "socket.io");
          return;
        }
      } catch (err) {
        log(`[socketPolicy] Error checking membership for ${conversationId}: ${err}`, "socket.io");
        return;
      }
    }

    try {
      await handler(ctx, payload, socket);
    } catch (err) {
      log(`[socketPolicy] Handler error (socket=${socket.id}): ${err}`, "socket.io");
    }
  };
}
