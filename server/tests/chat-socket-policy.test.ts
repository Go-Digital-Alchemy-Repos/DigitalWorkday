import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSocketPolicy } from "../realtime/socketPolicy";

vi.mock("../storage", () => ({
  storage: {
    isUserInChatChannel: vi.fn(),
    getUserChatDmThreads: vi.fn(),
  },
}));

import { storage } from "../storage";

function createFakeSocket(overrides: Record<string, any> = {}) {
  return {
    id: "sock-abc",
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

  it("denies handler when conversationId is missing (requireChatMembership)", async () => {
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(
      socket as any,
      { requireAuth: true, requireTenant: true, requireChatMembership: true },
      handler
    );

    await guarded({});

    expect(handler).not.toHaveBeenCalled();
  });

  it("denies handler when conversationId format is invalid", async () => {
    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(
      socket as any,
      { requireAuth: true, requireTenant: true, requireChatMembership: true },
      handler
    );

    await guarded({ conversationId: "invalid-format" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler with correct AuthorizedContext when all checks pass (channel)", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(true);

    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(
      socket as any,
      { requireAuth: true, requireTenant: true, requireChatMembership: true },
      handler
    );

    await guarded({ conversationId: "channel:ch1" });

    expect(storage.isUserInChatChannel).toHaveBeenCalledWith("u1", "ch1");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      { userId: "u1", tenantId: "t1", socketId: "sock-abc" },
      { conversationId: "channel:ch1" },
      expect.objectContaining({ id: "sock-abc" })
    );
  });

  it("calls handler with correct AuthorizedContext when all checks pass (dm)", async () => {
    vi.mocked(storage.getUserChatDmThreads).mockResolvedValue([
      { id: "dm1" } as any,
    ]);

    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(
      socket as any,
      { requireAuth: true, requireTenant: true, requireChatMembership: true },
      handler
    );

    await guarded({ conversationId: "dm:dm1" });

    expect(storage.getUserChatDmThreads).toHaveBeenCalledWith("t1", "u1");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("denies handler when user is not a member of the channel", async () => {
    vi.mocked(storage.isUserInChatChannel).mockResolvedValue(false);

    const socket = createFakeSocket({ userId: "u1", tenantId: "t1" });
    const guarded = withSocketPolicy(
      socket as any,
      { requireAuth: true, requireTenant: true, requireChatMembership: true },
      handler
    );

    await guarded({ conversationId: "channel:ch1" });

    expect(handler).not.toHaveBeenCalled();
  });
});
