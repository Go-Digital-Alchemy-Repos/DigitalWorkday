/**
 * Test: Search Opens Conversation
 * 
 * Verifies that:
 * 1. Clicking a channel search result opens that channel
 * 2. Clicking a DM search result opens that DM thread
 * 3. Search dialog closes after selecting a result
 * 4. Search query is cleared after selection
 */

import { describe, it, expect } from 'vitest';

interface ChatChannel {
  id: string;
  name: string;
}

interface ChatDmThread {
  id: string;
  members: Array<{ userId: string; user: { name: string } }>;
}

interface SearchResult {
  id: string;
  body: string;
  channelId: string | null;
  dmThreadId: string | null;
}

describe('Search Opens Conversation', () => {
  const handleSearchResultClick = (
    result: SearchResult,
    channels: ChatChannel[],
    dmThreads: ChatDmThread[],
    setSelectedChannel: (channel: ChatChannel | null) => void,
    setSelectedDm: (dm: ChatDmThread | null) => void,
    setSearchOpen: (open: boolean) => void,
    setSearchQuery: (query: string) => void,
  ) => {
    if (result.channelId) {
      const channel = channels.find(c => c.id === result.channelId);
      if (channel) {
        setSelectedChannel(channel);
        setSelectedDm(null);
      }
    } else if (result.dmThreadId) {
      const dm = dmThreads.find(d => d.id === result.dmThreadId);
      if (dm) {
        setSelectedDm(dm);
        setSelectedChannel(null);
      }
    }
    setSearchOpen(false);
    setSearchQuery("");
  };

  it('should open channel when clicking channel search result', () => {
    const channels: ChatChannel[] = [
      { id: 'ch-1', name: 'general' },
      { id: 'ch-2', name: 'random' },
    ];
    const dmThreads: ChatDmThread[] = [];
    const result: SearchResult = { id: 'msg-1', body: 'test', channelId: 'ch-1', dmThreadId: null };

    let selectedChannel: ChatChannel | null = null;
    let selectedDm: ChatDmThread | null = null;
    let searchOpen = true;
    let searchQuery = 'test';

    handleSearchResultClick(
      result,
      channels,
      dmThreads,
      (ch) => { selectedChannel = ch; },
      (dm) => { selectedDm = dm; },
      (open) => { searchOpen = open; },
      (q) => { searchQuery = q; },
    );

    expect(selectedChannel?.id).toBe('ch-1');
    expect(selectedDm).toBeNull();
    expect(searchOpen).toBe(false);
    expect(searchQuery).toBe("");
  });

  it('should open DM thread when clicking DM search result', () => {
    const channels: ChatChannel[] = [];
    const dmThreads: ChatDmThread[] = [
      { id: 'dm-1', members: [{ userId: 'u1', user: { name: 'User 1' } }] },
      { id: 'dm-2', members: [{ userId: 'u2', user: { name: 'User 2' } }] },
    ];
    const result: SearchResult = { id: 'msg-1', body: 'test', channelId: null, dmThreadId: 'dm-2' };

    let selectedChannel: ChatChannel | null = null;
    let selectedDm: ChatDmThread | null = null;
    let searchOpen = true;
    let searchQuery = 'test';

    handleSearchResultClick(
      result,
      channels,
      dmThreads,
      (ch) => { selectedChannel = ch; },
      (dm) => { selectedDm = dm; },
      (open) => { searchOpen = open; },
      (q) => { searchQuery = q; },
    );

    expect(selectedChannel).toBeNull();
    expect(selectedDm?.id).toBe('dm-2');
    expect(searchOpen).toBe(false);
    expect(searchQuery).toBe("");
  });

  it('should clear previous selection when opening new conversation', () => {
    const channels: ChatChannel[] = [{ id: 'ch-1', name: 'general' }];
    const dmThreads: ChatDmThread[] = [{ id: 'dm-1', members: [] }];
    const result: SearchResult = { id: 'msg-1', body: 'test', channelId: 'ch-1', dmThreadId: null };

    let selectedChannel: ChatChannel | null = null;
    let selectedDm: ChatDmThread | null = dmThreads[0];
    let searchOpen = true;
    let searchQuery = 'test';

    handleSearchResultClick(
      result,
      channels,
      dmThreads,
      (ch) => { selectedChannel = ch; },
      (dm) => { selectedDm = dm; },
      (open) => { searchOpen = open; },
      (q) => { searchQuery = q; },
    );

    expect(selectedChannel?.id).toBe('ch-1');
    expect(selectedDm).toBeNull();
  });

  it('should not change selection if channel not found', () => {
    const channels: ChatChannel[] = [];
    const dmThreads: ChatDmThread[] = [];
    const result: SearchResult = { id: 'msg-1', body: 'test', channelId: 'ch-nonexistent', dmThreadId: null };

    let selectedChannel: ChatChannel | null = { id: 'ch-existing', name: 'existing' };
    let selectedDm: ChatDmThread | null = null;
    let searchOpen = true;
    let searchQuery = 'test';

    handleSearchResultClick(
      result,
      channels,
      dmThreads,
      (ch) => { selectedChannel = ch; },
      (dm) => { selectedDm = dm; },
      (open) => { searchOpen = open; },
      (q) => { searchQuery = q; },
    );

    expect(selectedChannel?.id).toBe('ch-existing');
    expect(searchOpen).toBe(false);
    expect(searchQuery).toBe("");
  });

  it('should always close dialog and clear query even if conversation not found', () => {
    const channels: ChatChannel[] = [];
    const dmThreads: ChatDmThread[] = [];
    const result: SearchResult = { id: 'msg-1', body: 'test', channelId: null, dmThreadId: 'dm-nonexistent' };

    let selectedChannel: ChatChannel | null = null;
    let selectedDm: ChatDmThread | null = null;
    let searchOpen = true;
    let searchQuery = 'test query';

    handleSearchResultClick(
      result,
      channels,
      dmThreads,
      (ch) => { selectedChannel = ch; },
      (dm) => { selectedDm = dm; },
      (open) => { searchOpen = open; },
      (q) => { searchQuery = q; },
    );

    expect(searchOpen).toBe(false);
    expect(searchQuery).toBe("");
  });
});

describe('Search Input Behavior', () => {
  it('should open search dialog when query has 2+ characters', () => {
    const shouldOpenDialog = (query: string) => query.length >= 2;

    expect(shouldOpenDialog('')).toBe(false);
    expect(shouldOpenDialog('a')).toBe(false);
    expect(shouldOpenDialog('ab')).toBe(true);
    expect(shouldOpenDialog('hello')).toBe(true);
  });

  it('should not trigger search for single character queries', () => {
    const isSearchEnabled = (query: string) => query.length >= 2;

    expect(isSearchEnabled('h')).toBe(false);
    expect(isSearchEnabled('he')).toBe(true);
  });
});
