import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import {
  users, tenants, workspaces,
  chatChannels, chatChannelMembers, chatDmThreads, chatDmMembers, chatMessages,
  TenantStatus, UserRole,
} from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import {
  createTestTenant,
  createTestWorkspace,
  createTestUser,
} from "./fixtures";
import {
  requireChannelMember,
  requireChannelMemberStrict,
  requireDmMember,
  resolveMessageContainer,
  requireMessageAccess,
} from "../features/chat/security/membership";
import { createScopedChatRepo } from "../features/chat/security/scopedChatRepo";
import { isChatAdmin } from "../features/chat/security/chatPolicy";

describe("Chat Security - Membership Helpers", () => {
  let tenantA: any;
  let tenantB: any;
  let userA1: any;
  let userA2: any;
  let userB1: any;
  let channelPublic: any;
  let channelPrivate: any;
  let channelB: any;
  let dmThreadA: any;
  let messageInPublic: any;
  let messageInPrivate: any;
  let messageInDm: any;

  beforeAll(async () => {
    tenantA = await createTestTenant({ name: "Security Test Tenant A" });
    tenantB = await createTestTenant({ name: "Security Test Tenant B" });
    await createTestWorkspace({ tenantId: tenantA.id, isPrimary: true });
    await createTestWorkspace({ tenantId: tenantB.id, isPrimary: true });

    userA1 = await createTestUser({
      email: `sec-a1-${Date.now()}@test.com`,
      role: UserRole.ADMIN,
      tenantId: tenantA.id,
    });
    userA2 = await createTestUser({
      email: `sec-a2-${Date.now()}@test.com`,
      role: UserRole.EMPLOYEE,
      tenantId: tenantA.id,
    });
    userB1 = await createTestUser({
      email: `sec-b1-${Date.now()}@test.com`,
      role: UserRole.ADMIN,
      tenantId: tenantB.id,
    });

    [channelPublic] = await db.insert(chatChannels).values({
      tenantId: tenantA.id,
      name: "sec-public",
      isPrivate: false,
      createdBy: userA1.id,
    }).returning();

    [channelPrivate] = await db.insert(chatChannels).values({
      tenantId: tenantA.id,
      name: "sec-private",
      isPrivate: true,
      createdBy: userA1.id,
    }).returning();

    [channelB] = await db.insert(chatChannels).values({
      tenantId: tenantB.id,
      name: "sec-b-channel",
      isPrivate: false,
      createdBy: userB1.id,
    }).returning();

    await db.insert(chatChannelMembers).values({
      tenantId: tenantA.id,
      channelId: channelPublic.id,
      userId: userA1.id,
      role: "owner",
    });

    await db.insert(chatChannelMembers).values({
      tenantId: tenantA.id,
      channelId: channelPrivate.id,
      userId: userA1.id,
      role: "owner",
    });

    await db.insert(chatChannelMembers).values({
      tenantId: tenantB.id,
      channelId: channelB.id,
      userId: userB1.id,
      role: "owner",
    });

    [dmThreadA] = await db.insert(chatDmThreads).values({
      tenantId: tenantA.id,
    }).returning();

    await db.insert(chatDmMembers).values([
      { tenantId: tenantA.id, dmThreadId: dmThreadA.id, userId: userA1.id },
      { tenantId: tenantA.id, dmThreadId: dmThreadA.id, userId: userA2.id },
    ]);

    [messageInPublic] = await db.insert(chatMessages).values({
      tenantId: tenantA.id,
      channelId: channelPublic.id,
      authorUserId: userA1.id,
      body: "Test message in public channel",
    }).returning();

    [messageInPrivate] = await db.insert(chatMessages).values({
      tenantId: tenantA.id,
      channelId: channelPrivate.id,
      authorUserId: userA1.id,
      body: "Test message in private channel",
    }).returning();

    [messageInDm] = await db.insert(chatMessages).values({
      tenantId: tenantA.id,
      dmThreadId: dmThreadA.id,
      authorUserId: userA1.id,
      body: "Test DM message",
    }).returning();
  });

  afterAll(async () => {
    await db.delete(chatMessages).where(eq(chatMessages.tenantId, tenantA.id));
    await db.delete(chatMessages).where(eq(chatMessages.tenantId, tenantB.id));
    await db.delete(chatDmMembers).where(eq(chatDmMembers.tenantId, tenantA.id));
    await db.delete(chatDmThreads).where(eq(chatDmThreads.tenantId, tenantA.id));
    await db.delete(chatChannelMembers).where(eq(chatChannelMembers.tenantId, tenantA.id));
    await db.delete(chatChannelMembers).where(eq(chatChannelMembers.tenantId, tenantB.id));
    await db.delete(chatChannels).where(eq(chatChannels.tenantId, tenantA.id));
    await db.delete(chatChannels).where(eq(chatChannels.tenantId, tenantB.id));
    await db.delete(users).where(eq(users.id, userA1.id));
    await db.delete(users).where(eq(users.id, userA2.id));
    await db.delete(users).where(eq(users.id, userB1.id));
    await db.delete(workspaces).where(eq(workspaces.tenantId, tenantA.id));
    await db.delete(workspaces).where(eq(workspaces.tenantId, tenantB.id));
    await db.delete(tenants).where(eq(tenants.id, tenantA.id));
    await db.delete(tenants).where(eq(tenants.id, tenantB.id));
  });

  describe("requireChannelMember", () => {
    it("allows access to public channel for tenant member", async () => {
      await expect(
        requireChannelMember(tenantA.id, userA2.id, channelPublic.id)
      ).resolves.toBeUndefined();
    });

    it("allows access to private channel for channel member", async () => {
      await expect(
        requireChannelMember(tenantA.id, userA1.id, channelPrivate.id)
      ).resolves.toBeUndefined();
    });

    it("denies access to private channel for non-member", async () => {
      await expect(
        requireChannelMember(tenantA.id, userA2.id, channelPrivate.id)
      ).rejects.toThrow("Channel not found");
    });

    it("denies cross-tenant access", async () => {
      await expect(
        requireChannelMember(tenantA.id, userA1.id, channelB.id)
      ).rejects.toThrow("Channel not found");
    });

    it("denies access with wrong tenantId", async () => {
      await expect(
        requireChannelMember(tenantB.id, userA1.id, channelPublic.id)
      ).rejects.toThrow("Channel not found");
    });
  });

  describe("requireChannelMemberStrict", () => {
    it("allows channel member access", async () => {
      await expect(
        requireChannelMemberStrict(tenantA.id, userA1.id, channelPublic.id)
      ).resolves.toBeUndefined();
    });

    it("denies non-member access even to public channels", async () => {
      await expect(
        requireChannelMemberStrict(tenantA.id, userA2.id, channelPublic.id)
      ).rejects.toThrow("Not a member of this channel");
    });
  });

  describe("requireDmMember", () => {
    it("allows DM member access", async () => {
      await expect(
        requireDmMember(tenantA.id, userA1.id, dmThreadA.id)
      ).resolves.toBeUndefined();
    });

    it("denies non-member DM access", async () => {
      await expect(
        requireDmMember(tenantA.id, userB1.id, dmThreadA.id)
      ).rejects.toThrow("DM thread not found");
    });

    it("denies cross-tenant DM access", async () => {
      await expect(
        requireDmMember(tenantB.id, userB1.id, dmThreadA.id)
      ).rejects.toThrow("DM thread not found");
    });
  });

  describe("resolveMessageContainer", () => {
    it("resolves channel message container", async () => {
      const container = await resolveMessageContainer(messageInPublic.id, tenantA.id);
      expect(container.type).toBe("channel");
      expect(container.id).toBe(channelPublic.id);
      expect(container.tenantId).toBe(tenantA.id);
    });

    it("resolves DM message container", async () => {
      const container = await resolveMessageContainer(messageInDm.id, tenantA.id);
      expect(container.type).toBe("dm");
      expect(container.id).toBe(dmThreadA.id);
      expect(container.tenantId).toBe(tenantA.id);
    });

    it("denies cross-tenant message resolution (returns 404, not 403)", async () => {
      await expect(
        resolveMessageContainer(messageInPublic.id, tenantB.id)
      ).rejects.toThrow("Message not found");
    });

    it("denies non-existent message", async () => {
      await expect(
        resolveMessageContainer("non-existent-id", tenantA.id)
      ).rejects.toThrow("Message not found");
    });
  });

  describe("requireMessageAccess", () => {
    it("allows member to access message in public channel", async () => {
      const container = await requireMessageAccess(tenantA.id, userA2.id, messageInPublic.id);
      expect(container.type).toBe("channel");
    });

    it("denies non-member access to message in private channel", async () => {
      await expect(
        requireMessageAccess(tenantA.id, userA2.id, messageInPrivate.id)
      ).rejects.toThrow();
    });

    it("allows DM member to access DM message", async () => {
      const container = await requireMessageAccess(tenantA.id, userA1.id, messageInDm.id);
      expect(container.type).toBe("dm");
    });

    it("denies non-member access to DM message", async () => {
      await expect(
        requireMessageAccess(tenantA.id, userB1.id, messageInDm.id)
      ).rejects.toThrow();
    });

    it("cross-tenant message access returns 404 (no existence leak)", async () => {
      await expect(
        requireMessageAccess(tenantB.id, userB1.id, messageInPublic.id)
      ).rejects.toThrow("Message not found");
    });
  });

  describe("isChatAdmin", () => {
    it("returns true for admin user", async () => {
      const result = await isChatAdmin(tenantA.id, userA1.id);
      expect(result).toBe(true);
    });

    it("returns false for employee user", async () => {
      const result = await isChatAdmin(tenantA.id, userA2.id);
      expect(result).toBe(false);
    });

    it("returns false for cross-tenant admin", async () => {
      const result = await isChatAdmin(tenantA.id, userB1.id);
      expect(result).toBe(false);
    });
  });

  describe("ScopedChatRepo", () => {
    it("getChannelScoped succeeds for correct tenant", async () => {
      const repo = createScopedChatRepo(tenantA.id, userA1.id);
      const channel = await repo.getChannelScoped(channelPublic.id);
      expect(channel.id).toBe(channelPublic.id);
    });

    it("getChannelScoped denies wrong tenant", async () => {
      const repo = createScopedChatRepo(tenantB.id, userB1.id);
      await expect(repo.getChannelScoped(channelPublic.id)).rejects.toThrow("Channel not found");
    });

    it("getMessageWithAccessCheck verifies membership", async () => {
      const repo = createScopedChatRepo(tenantA.id, userA2.id);
      await expect(
        repo.getMessageWithAccessCheck(messageInPrivate.id)
      ).rejects.toThrow();
    });

    it("getMessageWithAccessCheck allows member access", async () => {
      const repo = createScopedChatRepo(tenantA.id, userA1.id);
      const { message, container } = await repo.getMessageWithAccessCheck(messageInPrivate.id);
      expect(message.id).toBe(messageInPrivate.id);
      expect(container.type).toBe("channel");
    });

    it("getDmThreadWithMemberCheck denies non-member", async () => {
      const repo = createScopedChatRepo(tenantA.id, userB1.id);
      await expect(repo.getDmThreadWithMemberCheck(dmThreadA.id)).rejects.toThrow();
    });
  });
});
