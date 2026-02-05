# Chat Phase 4: Message Timeline UX

## Overview

This phase implements an enhanced message timeline for the chat thread panel with grouped messages, date separators, smart auto-scroll, and optimistic sending states.

## Component: ChatMessageTimeline

Location: `client/src/features/chat/ChatMessageTimeline.tsx`

### Features

#### 1. Message Grouping

Consecutive messages from the same author are grouped together when:
- Same author
- Same day
- Within 5 minutes of each other

Grouped messages show:
- Single avatar and name at the start of the group
- Each message in a compact format
- Hover timestamps for individual messages within the group

#### 2. Date Separators

Visual dividers appear between messages on different days:
- "Today" for current day
- "Yesterday" for previous day
- Full date format for older dates (e.g., "Monday, January 15")

#### 3. Hover Timestamps

- Relative time shown inline (e.g., "2:30 PM")
- Full datetime shown in tooltip on hover (e.g., "Mon, Jan 15, 2026, 2:30 PM")
- For grouped messages, timestamp appears on hover in the left margin

#### 4. Smart Auto-Scroll

Behavior:
- If user is at bottom of chat, new messages auto-scroll into view
- If user's own message is sent, always scroll to bottom
- If user scrolled up and new message arrives, show "New messages" chip
- Clicking chip scrolls to bottom and dismisses it

Implementation:
- Tracks scroll position with threshold detection (100px from bottom)
- Uses `bottomRef` element and `scrollIntoView` for smooth scrolling
- State: `isAtBottom`, `hasNewMessages`

#### 5. Load Older Messages

- "Load older messages" button at top of message list
- Preserves scroll position when prepending older messages
- Shows loading spinner while fetching
- Optional: Can be converted to infinite scroll with intersection observer

#### 6. Delivery States

**Pending (Optimistic)**
- Message appears immediately with reduced opacity (60%)
- Shows spinning loader indicator

**Failed**
- Red background highlight
- "Failed" label with alert icon
- "Retry" button to resend
- "Remove" button to discard

### Props Interface

```typescript
interface ChatMessageTimelineProps {
  messages: ChatMessage[];
  currentUserId?: string;
  currentUserRole?: string;
  isLoading?: boolean;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onEditMessage?: (messageId: string, body: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (message: ChatMessage) => void;
  onRemoveFailedMessage?: (tempId: string) => void;
  renderMessageBody?: (body: string) => React.ReactNode;
  getFileIcon?: (mimeType: string) => React.ComponentType<{ className?: string }>;
  formatFileSize?: (bytes: number) => string;
  isDm?: boolean;
  className?: string;
}
```

### Message Type

```typescript
interface ChatMessage {
  id: string;
  body: string;
  authorUserId: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  createdAt: Date | string;
  editedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  author?: {
    id: string;
    name?: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  _tempId?: string;          // For optimistic messages
  _status?: "pending" | "failed";  // Delivery state
}
```

### Integration Example

```tsx
<ChatMessageTimeline
  messages={messages}
  currentUserId={user?.id}
  currentUserRole={user?.role}
  isLoading={messagesQuery.isLoading}
  hasMoreMessages={hasNextPage}
  onLoadMore={() => fetchNextPage()}
  isLoadingMore={isFetchingNextPage}
  onEditMessage={(id, body) => editMutation.mutate({ id, body })}
  onDeleteMessage={(id) => deleteMutation.mutate(id)}
  onRetryMessage={retryFailedMessage}
  onRemoveFailedMessage={removeFailedMessage}
  renderMessageBody={renderMessageBody}
  getFileIcon={getFileIcon}
  formatFileSize={formatFileSize}
  isDm={!!selectedDm}
  className="flex-1"
/>
```

## Message Grouping Algorithm

```typescript
function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  // For each message:
  // 1. Check if needs date separator (different day from previous)
  // 2. Check if should group with previous (same author, same day, within 5 min)
  // 3. Either extend current group or start new group
}
```

## Scroll Position Preservation

When loading older messages:
1. Save current scrollHeight and scrollTop before fetch
2. After messages prepended, calculate new scroll position
3. Restore scroll position to maintain visual stability

```typescript
const scrollPositionRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

const handleLoadMore = () => {
  const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
  if (scrollContainer) {
    scrollPositionRef.current = {
      scrollHeight: scrollContainer.scrollHeight,
      scrollTop: scrollContainer.scrollTop,
    };
    onLoadMore?.();
  }
};

// After messages update
useEffect(() => {
  if (scrollPositionRef.current) {
    const container = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (container) {
      const { scrollHeight: oldHeight, scrollTop: oldScrollTop } = scrollPositionRef.current;
      container.scrollTop = container.scrollHeight - oldHeight + oldScrollTop;
      scrollPositionRef.current = null;
    }
  }
}, [messages]);
```

## Visual Design

- Message groups have subtle vertical spacing
- Date separators use horizontal rules with centered label
- Hover states reveal action menu and timestamps
- Failed messages have destructive background tint
- Avatar shown once per group, not per message
- Compact message layout for better density

## Test IDs

- `message-group-{id}` - Message group container
- `message-{id}` - Individual message
- `date-separator` - Date divider
- `messages-loading` - Loading skeleton
- `empty-messages` - Empty state
- `button-load-more` - Load older messages button
- `button-new-messages` - New messages chip
- `message-menu-{id}` - Message action menu trigger
- `message-edit-{id}` - Edit action
- `message-delete-{id}` - Delete action
- `message-retry-{tempId}` - Retry failed message
- `message-remove-{tempId}` - Remove failed message
- `attachment-{id}` - Attachment link

## Future Enhancements

- Infinite scroll with intersection observer
- Keyboard navigation between messages
- Message reactions
- Reply threading
- Message bookmarking
- Read receipts per message
