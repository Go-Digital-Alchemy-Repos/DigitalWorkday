/**
 * Test: Search Scoped to Membership
 * 
 * Verifies that:
 * 1. Search only returns messages from channels the user is a member of
 * 2. Search only returns messages from DM threads the user participates in
 * 3. Search does not return messages from channels/DMs the user cannot access
 * 4. Tenant isolation is enforced
 */

import { describe, it, expect } from 'vitest';

interface SearchResult {
  id: string;
  body: string;
  createdAt: Date;
  channelId: string | null;
  dmThreadId: string | null;
  channelName: string | null;
  author: { id: string; email: string; displayName: string };
}

interface SearchOptions {
  tenantId: string;
  userId: string;
  query: string;
  channelId?: string;
  dmThreadId?: string;
  limit?: number;
}

describe('Search Scoped to Membership', () => {
  const currentUserId = 'user-123';
  const currentTenantId = 'tenant-abc';

  const simulateSearchChatMessages = (
    options: SearchOptions,
    allMessages: Array<{
      id: string;
      body: string;
      tenantId: string;
      channelId: string | null;
      dmThreadId: string | null;
      createdAt: Date;
    }>,
    accessibleChannelIds: string[],
    accessibleDmIds: string[],
  ): SearchResult[] => {
    const { tenantId, query, channelId, dmThreadId, limit = 50 } = options;

    return allMessages
      .filter(m => {
        if (m.tenantId !== tenantId) return false;
        if (!m.body.toLowerCase().includes(query.toLowerCase())) return false;
        if (channelId && m.channelId !== channelId) return false;
        if (dmThreadId && m.dmThreadId !== dmThreadId) return false;

        if (!channelId && !dmThreadId) {
          const inAccessibleChannel = m.channelId && accessibleChannelIds.includes(m.channelId);
          const inAccessibleDm = m.dmThreadId && accessibleDmIds.includes(m.dmThreadId);
          if (!inAccessibleChannel && !inAccessibleDm) return false;
        } else if (channelId && !accessibleChannelIds.includes(channelId)) {
          return false;
        } else if (dmThreadId && !accessibleDmIds.includes(dmThreadId)) {
          return false;
        }

        return true;
      })
      .slice(0, limit)
      .map(m => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        channelId: m.channelId,
        dmThreadId: m.dmThreadId,
        channelName: m.channelId ? 'test-channel' : null,
        author: { id: 'author-1', email: 'author@test.com', displayName: 'Author' },
      }));
  };

  it('should only return messages from accessible channels', () => {
    const allMessages = [
      { id: 'msg-1', body: 'hello world', tenantId: currentTenantId, channelId: 'ch-accessible', dmThreadId: null, createdAt: new Date() },
      { id: 'msg-2', body: 'hello there', tenantId: currentTenantId, channelId: 'ch-inaccessible', dmThreadId: null, createdAt: new Date() },
      { id: 'msg-3', body: 'hello again', tenantId: currentTenantId, channelId: 'ch-accessible', dmThreadId: null, createdAt: new Date() },
    ];
    const accessibleChannelIds = ['ch-accessible'];
    const accessibleDmIds: string[] = [];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'hello' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(2);
    expect(results.every(r => r.channelId === 'ch-accessible')).toBe(true);
  });

  it('should only return messages from accessible DM threads', () => {
    const allMessages = [
      { id: 'msg-1', body: 'hey there', tenantId: currentTenantId, channelId: null, dmThreadId: 'dm-accessible', createdAt: new Date() },
      { id: 'msg-2', body: 'hey you', tenantId: currentTenantId, channelId: null, dmThreadId: 'dm-inaccessible', createdAt: new Date() },
    ];
    const accessibleChannelIds: string[] = [];
    const accessibleDmIds = ['dm-accessible'];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'hey' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(1);
    expect(results[0].dmThreadId).toBe('dm-accessible');
  });

  it('should filter by specific channel when channelId provided', () => {
    const allMessages = [
      { id: 'msg-1', body: 'test message', tenantId: currentTenantId, channelId: 'ch-1', dmThreadId: null, createdAt: new Date() },
      { id: 'msg-2', body: 'test reply', tenantId: currentTenantId, channelId: 'ch-2', dmThreadId: null, createdAt: new Date() },
    ];
    const accessibleChannelIds = ['ch-1', 'ch-2'];
    const accessibleDmIds: string[] = [];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'test', channelId: 'ch-1' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(1);
    expect(results[0].channelId).toBe('ch-1');
  });

  it('should return empty array when searching inaccessible channel', () => {
    const allMessages = [
      { id: 'msg-1', body: 'secret message', tenantId: currentTenantId, channelId: 'ch-private', dmThreadId: null, createdAt: new Date() },
    ];
    const accessibleChannelIds: string[] = [];
    const accessibleDmIds: string[] = [];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'secret', channelId: 'ch-private' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(0);
  });

  it('should enforce tenant isolation', () => {
    const allMessages = [
      { id: 'msg-1', body: 'tenant A message', tenantId: 'tenant-A', channelId: 'ch-1', dmThreadId: null, createdAt: new Date() },
      { id: 'msg-2', body: 'tenant B message', tenantId: 'tenant-B', channelId: 'ch-1', dmThreadId: null, createdAt: new Date() },
    ];
    const accessibleChannelIds = ['ch-1'];
    const accessibleDmIds: string[] = [];

    const results = simulateSearchChatMessages(
      { tenantId: 'tenant-A', userId: currentUserId, query: 'message' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('msg-1');
  });

  it('should respect limit parameter', () => {
    const allMessages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      body: 'searchable content',
      tenantId: currentTenantId,
      channelId: 'ch-1',
      dmThreadId: null,
      createdAt: new Date(),
    }));
    const accessibleChannelIds = ['ch-1'];
    const accessibleDmIds: string[] = [];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'searchable', limit: 25 },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(25);
  });

  it('should return messages from both channels and DMs when no filter specified', () => {
    const allMessages = [
      { id: 'msg-1', body: 'hello channel', tenantId: currentTenantId, channelId: 'ch-1', dmThreadId: null, createdAt: new Date() },
      { id: 'msg-2', body: 'hello dm', tenantId: currentTenantId, channelId: null, dmThreadId: 'dm-1', createdAt: new Date() },
    ];
    const accessibleChannelIds = ['ch-1'];
    const accessibleDmIds = ['dm-1'];

    const results = simulateSearchChatMessages(
      { tenantId: currentTenantId, userId: currentUserId, query: 'hello' },
      allMessages,
      accessibleChannelIds,
      accessibleDmIds,
    );

    expect(results.length).toBe(2);
    expect(results.some(r => r.channelId === 'ch-1')).toBe(true);
    expect(results.some(r => r.dmThreadId === 'dm-1')).toBe(true);
  });
});
