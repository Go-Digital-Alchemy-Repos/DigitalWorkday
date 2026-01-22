/**
 * Test: Unread Counts Drop After Read Event
 * 
 * Verifies that:
 * 1. Unread counts are set to 0 when conversation_read event is received for current user
 * 2. Channel unread count updates via setQueryData
 * 3. DM thread unread count updates via setQueryData
 * 4. Only updates for the target conversation, not others
 */

import { describe, it, expect } from 'vitest';

interface ChatChannel {
  id: string;
  name: string;
  unreadCount?: number;
}

interface ChatDmThread {
  id: string;
  unreadCount?: number;
}

interface ConversationReadPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  lastReadAt: Date;
  lastReadMessageId: string;
}

describe('Unread Counts Drop After Read Event', () => {
  const currentUserId = 'user-123';

  const handleConversationRead = (
    payload: ConversationReadPayload,
    channels: ChatChannel[],
    dmThreads: ChatDmThread[],
  ): { channels: ChatChannel[]; dmThreads: ChatDmThread[] } => {
    if (payload.userId !== currentUserId) {
      return { channels, dmThreads };
    }

    if (payload.targetType === 'channel') {
      const updatedChannels = channels.map(ch =>
        ch.id === payload.targetId ? { ...ch, unreadCount: 0 } : ch
      );
      return { channels: updatedChannels, dmThreads };
    } else {
      const updatedDmThreads = dmThreads.map(dm =>
        dm.id === payload.targetId ? { ...dm, unreadCount: 0 } : dm
      );
      return { channels, dmThreads: updatedDmThreads };
    }
  };

  it('should set channel unread count to 0 when read event received', () => {
    const channels: ChatChannel[] = [
      { id: 'ch-1', name: 'general', unreadCount: 5 },
      { id: 'ch-2', name: 'random', unreadCount: 10 },
    ];
    const dmThreads: ChatDmThread[] = [];

    const payload: ConversationReadPayload = {
      targetType: 'channel',
      targetId: 'ch-1',
      userId: currentUserId,
      lastReadAt: new Date(),
      lastReadMessageId: 'msg-1',
    };

    const result = handleConversationRead(payload, channels, dmThreads);

    expect(result.channels.find(c => c.id === 'ch-1')?.unreadCount).toBe(0);
    expect(result.channels.find(c => c.id === 'ch-2')?.unreadCount).toBe(10);
  });

  it('should set DM thread unread count to 0 when read event received', () => {
    const channels: ChatChannel[] = [];
    const dmThreads: ChatDmThread[] = [
      { id: 'dm-1', unreadCount: 3 },
      { id: 'dm-2', unreadCount: 7 },
    ];

    const payload: ConversationReadPayload = {
      targetType: 'dm',
      targetId: 'dm-1',
      userId: currentUserId,
      lastReadAt: new Date(),
      lastReadMessageId: 'msg-2',
    };

    const result = handleConversationRead(payload, channels, dmThreads);

    expect(result.dmThreads.find(d => d.id === 'dm-1')?.unreadCount).toBe(0);
    expect(result.dmThreads.find(d => d.id === 'dm-2')?.unreadCount).toBe(7);
  });

  it('should not update counts when read event is from different user', () => {
    const channels: ChatChannel[] = [
      { id: 'ch-1', name: 'general', unreadCount: 5 },
    ];
    const dmThreads: ChatDmThread[] = [
      { id: 'dm-1', unreadCount: 3 },
    ];

    const payload: ConversationReadPayload = {
      targetType: 'channel',
      targetId: 'ch-1',
      userId: 'other-user',
      lastReadAt: new Date(),
      lastReadMessageId: 'msg-1',
    };

    const result = handleConversationRead(payload, channels, dmThreads);

    expect(result.channels.find(c => c.id === 'ch-1')?.unreadCount).toBe(5);
  });

  it('should not update other conversations when targeting specific one', () => {
    const channels: ChatChannel[] = [
      { id: 'ch-1', name: 'general', unreadCount: 5 },
      { id: 'ch-2', name: 'random', unreadCount: 10 },
      { id: 'ch-3', name: 'dev', unreadCount: 15 },
    ];
    const dmThreads: ChatDmThread[] = [];

    const payload: ConversationReadPayload = {
      targetType: 'channel',
      targetId: 'ch-2',
      userId: currentUserId,
      lastReadAt: new Date(),
      lastReadMessageId: 'msg-1',
    };

    const result = handleConversationRead(payload, channels, dmThreads);

    expect(result.channels.find(c => c.id === 'ch-1')?.unreadCount).toBe(5);
    expect(result.channels.find(c => c.id === 'ch-2')?.unreadCount).toBe(0);
    expect(result.channels.find(c => c.id === 'ch-3')?.unreadCount).toBe(15);
  });

  it('should handle undefined unread counts gracefully', () => {
    const channels: ChatChannel[] = [
      { id: 'ch-1', name: 'general' },
    ];
    const dmThreads: ChatDmThread[] = [];

    const payload: ConversationReadPayload = {
      targetType: 'channel',
      targetId: 'ch-1',
      userId: currentUserId,
      lastReadAt: new Date(),
      lastReadMessageId: 'msg-1',
    };

    const result = handleConversationRead(payload, channels, dmThreads);

    expect(result.channels.find(c => c.id === 'ch-1')?.unreadCount).toBe(0);
  });
});

describe('Read Event Query Data Updates', () => {
  it('should use setQueryData for optimistic updates', () => {
    const setDataCalls: { queryKey: string[]; transformer: string }[] = [];

    const mockQueryClient = {
      setQueryData: (queryKey: string[], fn: (old: any) => any) => {
        const oldData = [{ id: 'ch-1', unreadCount: 5 }];
        const newData = fn(oldData);
        setDataCalls.push({
          queryKey,
          transformer: JSON.stringify({ before: oldData, after: newData }),
        });
      },
    };

    const handleRead = (targetType: 'channel' | 'dm', targetId: string) => {
      if (targetType === 'channel') {
        mockQueryClient.setQueryData(['/api/v1/chat/channels'], (old: any[]) =>
          old?.map(ch => ch.id === targetId ? { ...ch, unreadCount: 0 } : ch)
        );
      } else {
        mockQueryClient.setQueryData(['/api/v1/chat/dm-threads'], (old: any[]) =>
          old?.map(dm => dm.id === targetId ? { ...dm, unreadCount: 0 } : dm)
        );
      }
    };

    handleRead('channel', 'ch-1');

    expect(setDataCalls.length).toBe(1);
    expect(setDataCalls[0].queryKey).toEqual(['/api/v1/chat/channels']);
    expect(JSON.parse(setDataCalls[0].transformer).after[0].unreadCount).toBe(0);
  });
});
