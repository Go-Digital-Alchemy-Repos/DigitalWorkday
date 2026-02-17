import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startTyping,
  stopTyping,
  getTypingUsers,
  cleanupExpiredTyping,
  cleanupSocketTyping,
  registerTypingSocket,
  parseConversationId,
} from "../realtime/typing";

vi.mock("../storage", () => ({
  storage: {
    isUserInChatChannel: vi.fn(),
    getUserChatDmThreads: vi.fn(),
    validateChatRoomAccess: vi.fn(),
  },
}));

import { storage } from "../storage";
import { withSocketPolicy } from "../realtime/socketPolicy";

function createFakeSocket(overrides: Record<string, any> = {}) {
  return {
    id: "sock-" + Math.random().toString(36).substr(2, 9),
    userId: undefined as string | undefined,
    tenantId: undefined as string | undefined | null,
    ...overrides,
  };
}

describe("Typing state tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const convId = "channel:ch-test";
    stopTyping("u1", convId, "s1");
    stopTyping("u2", convId, "s2");
    stopTyping("u3", convId, "s3");
  });

  it("startTyping adds user and getTypingUsers returns them", () => {
    registerTypingSocket("s1", "u1", "t1");
    const { stateChanged } = startTyping("t1", "u1", "channel:ch1", "s1");
    expect(stateChanged).toBe(true);

    const typers = getTypingUsers("channel:ch1");
    expect(typers).toContain("u1");
  });

  it("startTyping returns stateChanged=false on duplicate", () => {
    registerTypingSocket("s1", "u1", "t1");
    startTyping("t1", "u1", "channel:ch1", "s1");
    const { stateChanged } = startTyping("t1", "u1", "channel:ch1", "s1");
    expect(stateChanged).toBe(false);
  });

  it("stopTyping removes user from typing list", () => {
    registerTypingSocket("s1", "u1", "t1");
    startTyping("t1", "u1", "channel:ch2", "s1");
    expect(getTypingUsers("channel:ch2")).toContain("u1");

    const { stateChanged } = stopTyping("u1", "channel:ch2", "s1");
    expect(stateChanged).toBe(true);
    expect(getTypingUsers("channel:ch2")).not.toContain("u1");
  });

  it("multiple users typing produces merged list", () => {
    registerTypingSocket("s1", "u1", "t1");
    registerTypingSocket("s2", "u2", "t1");
    registerTypingSocket("s3", "u3", "t1");

    startTyping("t1", "u1", "channel:ch3", "s1");
    startTyping("t1", "u2", "channel:ch3", "s2");
    startTyping("t1", "u3", "channel:ch3", "s3");

    const typers = getTypingUsers("channel:ch3");
    expect(typers).toHaveLength(3);
    expect(typers).toContain("u1");
    expect(typers).toContain("u2");
    expect(typers).toContain("u3");
  });

  it("TTL expiration clears typing state", () => {
    registerTypingSocket("s1", "u1", "t1");
    startTyping("t1", "u1", "channel:ch4", "s1");
    expect(getTypingUsers("channel:ch4")).toContain("u1");

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10_000);
    const expired = cleanupExpiredTyping();
    expect(expired.length).toBeGreaterThanOrEqual(1);
    expect(expired[0].userId).toBe("u1");

    expect(getTypingUsers("channel:ch4")).not.toContain("u1");
    vi.restoreAllMocks();
  });

  it("cleanupSocketTyping removes all typing state for disconnected socket", () => {
    registerTypingSocket("s-dc", "u-dc", "t1");
    startTyping("t1", "u-dc", "channel:ch5", "s-dc");
    startTyping("t1", "u-dc", "dm:dm1", "s-dc");

    expect(getTypingUsers("channel:ch5")).toContain("u-dc");
    expect(getTypingUsers("dm:dm1")).toContain("u-dc");

    const cleaned = cleanupSocketTyping("s-dc");
    expect(cleaned).toHaveLength(2);
    expect(getTypingUsers("channel:ch5")).toHaveLength(0);
    expect(getTypingUsers("dm:dm1")).toHaveLength(0);
  });

  it("parseConversationId handles channel and dm prefixes", () => {
    expect(parseConversationId("channel:abc")).toEqual({ type: "channel", id: "abc" });
    expect(parseConversationId("dm:xyz")).toEqual({ type: "dm", id: "xyz" });
    expect(parseConversationId("invalid")).toBeNull();
  });
});

describe("Typing socket policy enforcement", () => {
  const handler = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies unauthenticated typing start", async () => {
    const socket = createFakeSocket();
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies typing start from wrong tenant (missing tenantId)", async () => {
    const socket = createFakeSocket({ userId: "u1", tenantId: null });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies typing start from non-member", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(false);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows typing start from authenticated member", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(true);
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(socket as any, { requireAuth: true, requireTenant: true, requireChatMembership: true }, handler);
    await guarded({ conversationId: "channel:ch1" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
