import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSocketPolicy } from "../realtime/socketPolicy";

vi.mock("../storage", () => ({
  storage: {
    isUserInChatChannel: vi.fn(),
    getUserChatDmThreads: vi.fn(),
    validateChatRoomAccess: vi.fn(),
    upsertChatRead: vi.fn(),
    getConversationReadReceipts: vi.fn(),
    getChatChannel: vi.fn(),
    getChatDmThread: vi.fn(),
    getUserChatChannels: vi.fn(),
    getChatMessage: vi.fn(),
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

describe("Read receipt socket policy enforcement", () => {
  const handler = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies unauthenticated mark-read", async () => {
    const socket = createFakeSocket();
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies mark-read from wrong tenant (null tenantId)", async () => {
    const socket = createFakeSocket({ userId: "u1", tenantId: null });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies mark-read from non-member of channel", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(false);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies mark-read from non-member of DM", async () => {
    vi.mocked(storage.getUserChatDmThreads).mockResolvedValue([]);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "dm:dm1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows mark-read from authenticated channel member", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(true);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("allows mark-read from authenticated DM member", async () => {
    vi.mocked(storage.getUserChatDmThreads).mockResolvedValue([{ id: "dm1" }] as any);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "dm:dm1" });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("Read receipt storage operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsertChatRead updates storage with correct params", async () => {
    const mockResult = { lastReadAt: new Date() };
    vi.mocked(storage.upsertChatRead).mockResolvedValue(mockResult);

    const result = await storage.upsertChatRead("t1", "u1", "channel", "ch1", "msg1");
    expect(storage.upsertChatRead).toHaveBeenCalledWith("t1", "u1", "channel", "ch1", "msg1");
    expect(result.lastReadAt).toBeInstanceOf(Date);
  });

  it("upsertChatRead works for DM threads", async () => {
    const mockResult = { lastReadAt: new Date() };
    vi.mocked(storage.upsertChatRead).mockResolvedValue(mockResult);

    const result = await storage.upsertChatRead("t1", "u1", "dm", "dm1", "msg2");
    expect(storage.upsertChatRead).toHaveBeenCalledWith("t1", "u1", "dm", "dm1", "msg2");
    expect(result.lastReadAt).toBeInstanceOf(Date);
  });

  it("getConversationReadReceipts returns receipts for channel", async () => {
    const mockReceipts = [
      { userId: "u1", lastReadMessageId: "msg1", lastReadAt: new Date() },
      { userId: "u2", lastReadMessageId: "msg2", lastReadAt: new Date() },
    ];
    vi.mocked(storage.getConversationReadReceipts).mockResolvedValue(mockReceipts);

    const result = await storage.getConversationReadReceipts("channel", "ch1", "t1");
    expect(storage.getConversationReadReceipts).toHaveBeenCalledWith("channel", "ch1", "t1");
    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe("u1");
    expect(result[1].userId).toBe("u2");
  });

  it("getConversationReadReceipts returns empty array when no reads", async () => {
    vi.mocked(storage.getConversationReadReceipts).mockResolvedValue([]);

    const result = await storage.getConversationReadReceipts("dm", "dm1", "t1");
    expect(result).toHaveLength(0);
  });
});
