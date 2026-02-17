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
  requireChatRoomAccess?: boolean;
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

const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 5_000;

interface CacheEntry {
  isMember: boolean;
  expiresAt: number;
}

const membershipCaches = new Map<string, Map<string, CacheEntry>>();

function getCacheKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function getCachedMembership(socketId: string, key: string): boolean | null {
  const socketCache = membershipCaches.get(socketId);
  if (!socketCache) return null;
  const entry = socketCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    socketCache.delete(key);
    return null;
  }
  return entry.isMember;
}

function setCachedMembership(socketId: string, key: string, isMember: boolean): void {
  let socketCache = membershipCaches.get(socketId);
  if (!socketCache) {
    socketCache = new Map();
    membershipCaches.set(socketId, socketCache);
  }
  const ttl = isMember ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  socketCache.set(key, { isMember, expiresAt: Date.now() + ttl });
}

export function invalidateMembershipCache(socketId: string, conversationKey?: string): void {
  if (!conversationKey) {
    membershipCaches.delete(socketId);
    return;
  }
  const socketCache = membershipCaches.get(socketId);
  if (socketCache) {
    socketCache.delete(conversationKey);
  }
}

export function invalidateMembershipCacheForUser(userId: string, conversationKey: string): void {
  for (const [socketId, socketCache] of membershipCaches) {
    socketCache.delete(conversationKey);
  }
}

export function cleanupSocketMembershipCache(socketId: string): void {
  membershipCaches.delete(socketId);
}

export function getMembershipCacheStats(): { sockets: number; totalEntries: number } {
  let totalEntries = 0;
  for (const cache of membershipCaches.values()) {
    totalEntries += cache.size;
  }
  return { sockets: membershipCaches.size, totalEntries };
}

async function checkMembership(
  ctx: AuthorizedContext,
  type: string,
  id: string,
  socketId: string
): Promise<boolean> {
  const cacheKey = getCacheKey(type, id);
  const cached = getCachedMembership(socketId, cacheKey);
  if (cached !== null) return cached;

  let isMember = false;
  if (type === "channel") {
    isMember = await storage.isUserInChatChannel(ctx.userId, id);
  } else if (type === "dm") {
    const userDmThreads = await storage.getUserChatDmThreads(ctx.tenantId, ctx.userId);
    isMember = userDmThreads.some((t) => t.id === id);
  }

  setCachedMembership(socketId, cacheKey, isMember);
  return isMember;
}

export function withSocketPolicy<TPayload = any>(
  socket: AuthenticatedSocket,
  options: SocketPolicyOptions,
  handler: PolicyHandler<TPayload>
): (payload: TPayload) => Promise<void> {
  const {
    requireAuth = true,
    requireTenant = true,
    requireChatMembership = false,
    requireChatRoomAccess = false,
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
        const isMember = await checkMembership(ctx, parsed.type, parsed.id, socket.id);
        if (!isMember) {
          log(`[socketPolicy] Denied: not a member of ${conversationId} (socket=${socket.id}, user=${ctx.userId})`, "socket.io");
          return;
        }
      } catch (err) {
        log(`[socketPolicy] Error checking membership for ${conversationId}: ${err}`, "socket.io");
        return;
      }
    }

    if (requireChatRoomAccess) {
      const targetType = (payload as any)?.targetType;
      const targetId = (payload as any)?.targetId;
      if (!targetType || !targetId) {
        log(`[socketPolicy] Denied: missing targetType/targetId (socket=${socket.id})`, "socket.io");
        return;
      }
      if (targetType !== "channel" && targetType !== "dm") {
        log(`[socketPolicy] Denied: invalid targetType=${targetType} (socket=${socket.id})`, "socket.io");
        return;
      }

      try {
        const cacheKey = getCacheKey(targetType, targetId);
        const cached = getCachedMembership(socket.id, cacheKey);
        let hasAccess: boolean;

        if (cached !== null) {
          hasAccess = cached;
        } else {
          hasAccess = await storage.validateChatRoomAccess(targetType, targetId, ctx.userId, ctx.tenantId);
          setCachedMembership(socket.id, cacheKey, hasAccess);
        }

        if (!hasAccess) {
          log(`[socketPolicy] Denied: no room access ${targetType}:${targetId} (socket=${socket.id}, user=${ctx.userId})`, "socket.io");
          return;
        }
      } catch (err) {
        log(`[socketPolicy] Error checking room access for ${targetType}:${targetId}: ${err}`, "socket.io");
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
