import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSocketPolicy, cleanupSocketMembershipCache, getMembershipCacheStats } from "../realtime/socketPolicy";

vi.mock("../storage", () => ({
  storage: {
    isUserInChatChannel: vi.fn(),
    getUserChatDmThreads: vi.fn(),
    validateChatRoomAccess: vi.fn(),
  },
}));

import { storage } from "../storage";

function createFakeSocket(overrides: Record<string, any> = {}) {
  return {
    id: "sock-" + Math.random().toString(36).substr(2, 9),
    userId: undefined as string | undefined,
    tenantId: undefined as string | undefined | null,
    ...overrides,
  };
}

describe("withSocketPolicy", () => {
  const handler = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies handler when userId is missing (requireAuth)", async () => {
    const socket = createFakeSocket();
    const guarded = withSocketPolicy(socket as any, { requireAuth: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies handler when tenantId is missing (requireTenant)", async () => {
    const socket = createFakeSocket({ userId: "u1", tenantId: null });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true }, handler);
    await guarded({});
    expect(handler).not.toHaveBeenCalled();
  });

  it("caches membership results to prevent redundant DB calls", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(true);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireChatMembership: true }, handler);

    // First call
    await guarded({ conversationId: "channel:ch1" });
    expect(storage.isUserInChatChannel).toHaveBeenCalledTimes(1);

    // Second call - should be cached
    await guarded({ conversationId: "channel:ch1" });
    expect(storage.isUserInChatChannel).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("enforces room access for join events", async () => {
    vi.mocked(storage.validateChatRoomAccess).mockResolvedValue(false);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireChatRoomAccess: true }, handler);

    await guarded({ targetType: "channel", targetId: "ch1" });
    expect(storage.validateChatRoomAccess).toHaveBeenCalledWith("channel", "ch1", "u1", "t1");
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows room access when validation passes", async () => {
    vi.mocked(storage.validateChatRoomAccess).mockResolvedValue(true);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireChatRoomAccess: true }, handler);

    await guarded({ targetType: "dm", targetId: "dm1" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("cleans up cache on request", () => {
    const socket = createFakeSocket();
    cleanupSocketMembershipCache(socket.id);
    const stats = getMembershipCacheStats();
    expect(stats.sockets).toBeLessThanOrEqual(getMembershipCacheStats().sockets);
  });
});
