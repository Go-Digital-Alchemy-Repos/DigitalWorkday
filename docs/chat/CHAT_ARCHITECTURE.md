# Chat Architecture

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Membership Rules](./MEMBERSHIP_RULES.md), [Chat Debugging](./CHAT_DEBUGGING.md)

---

## Overview

MyWorkDay includes a Slack-like tenant-scoped chat system with channels and direct messages. All chat functionality is isolated per tenant with strict membership enforcement.

---

## Core Concepts

### Channels
- **Tenant-scoped**: Every channel belongs to exactly one tenant
- **Membership-based**: Users must be members to send/receive messages
- **Visibility**: All tenant users can see channels exist; only members participate

### Direct Messages (DMs)
- **Tenant-scoped**: DM threads are within a single tenant
- **Two-party**: Exactly two users per DM thread
- **Private**: Only the two participants can see messages

---

## Data Model

```
tenants
└── chat_channels (tenantId, name, description, isPrivate)
    └── chat_channel_members (channelId, userId, role)
    └── chat_messages (channelId, senderId, content, attachments)

└── chat_dm_threads (tenantId, user1Id, user2Id)
    └── chat_messages (dmThreadId, senderId, content, attachments)
```

### Key Tables

| Table | tenant_id | Description |
|-------|-----------|-------------|
| chat_channels | Required | Channel definitions |
| chat_channel_members | Via channel | Channel membership |
| chat_dm_threads | Required | DM thread definitions |
| chat_messages | Required | All messages (channel + DM) |
| chat_reads | Via channel/dm | Read position tracking |

---

## Socket.IO Architecture

### Room Naming Convention

Rooms are namespaced by tenant to prevent cross-tenant visibility:

```typescript
// Channel rooms
`channel:${tenantId}:${channelId}`

// DM thread rooms
`dm:${tenantId}:${dmThreadId}`

// User notification rooms
`user:${userId}`
```

### Connection Flow

1. Client connects with authentication
2. Server resolves `effectiveTenantId`
3. Client joins tenant notification room
4. Client requests to join specific channel/DM rooms
5. Server validates membership before allowing join

```typescript
// Server-side join validation
socket.on("join:channel", async ({ channelId }) => {
  const tenantId = socket.data.effectiveTenantId;
  const userId = socket.data.userId;
  
  // Validate channel belongs to tenant
  const channel = await getChannel(channelId);
  if (channel.tenantId !== tenantId) {
    return socket.emit("error", { code: "FORBIDDEN" });
  }
  
  // Validate user is member
  const isMember = await isChannelMember(channelId, userId);
  if (!isMember) {
    return socket.emit("error", { code: "NOT_MEMBER" });
  }
  
  // Join tenant-scoped room
  socket.join(`channel:${tenantId}:${channelId}`);
});
```

### Message Sending

Messages are validated before broadcast:

```typescript
socket.on("message:send", async ({ channelId, content }) => {
  const tenantId = socket.data.effectiveTenantId;
  const userId = socket.data.userId;
  
  // Validate tenant match
  const channel = await getChannel(channelId);
  if (channel.tenantId !== tenantId) {
    return socket.emit("error", { code: "FORBIDDEN" });
  }
  
  // Validate membership
  const isMember = await isChannelMember(channelId, userId);
  if (!isMember) {
    return socket.emit("error", { code: "NOT_MEMBER" });
  }
  
  // Persist message
  const message = await createMessage({
    tenantId,
    channelId,
    senderId: userId,
    content,
  });
  
  // Broadcast to room
  io.to(`channel:${tenantId}:${channelId}`).emit("message:new", message);
});
```

---

## Tenant Isolation Enforcement

### On Every Query
```typescript
// List channels - tenant filtered
const channels = await db.select()
  .from(schema.chatChannels)
  .where(eq(schema.chatChannels.tenantId, effectiveTenantId));
```

### On Every Insert
```typescript
// Create message - tenant_id required
await db.insert(schema.chatMessages).values({
  tenantId: effectiveTenantId,  // Always set!
  channelId,
  senderId: userId,
  content,
});
```

### On Socket Events
```typescript
// Validate before joining room
if (channel.tenantId !== socket.data.effectiveTenantId) {
  throw new Error("Cross-tenant access denied");
}
```

---

## Reliability Features

### Connection Recovery
- Automatic reconnection with exponential backoff
- Room rejoin after reconnection
- Pending message retry queue

### Message Ordering
- Server timestamps for ordering
- Optimistic UI with pending state
- Deduplication by message ID

### Read Tracking
- `chat_reads` table tracks last read position
- Unread counts computed from read position
- Auto-mark as read when viewing

---

## Attachments

Chat attachments use the unified storage resolver:

```typescript
// Upload attachment
const config = await getStorageConfig(tenantId);
const key = `chat/${tenantId}/${threadId}/${filename}`;
await uploadToR2(config, key, file);

// Signed URL for download
const url = await getSignedDownloadUrl(config, key);
```

---

## Super Admin Access

Super admins can monitor chat for debugging:
- Read-only access to channel lists
- Message viewing for diagnostics
- No send capability

---

## What NOT to Do

### Never Skip Tenant Validation
```typescript
// WRONG - No tenant check
socket.join(`channel:${channelId}`);

// CORRECT - Tenant-scoped room
socket.join(`channel:${tenantId}:${channelId}`);
```

### Never Broadcast Without Membership Check
```typescript
// WRONG - Broadcast to anyone in room
io.to(channelId).emit("message", msg);

// CORRECT - Validate membership first
if (await isChannelMember(channelId, userId)) {
  io.to(`channel:${tenantId}:${channelId}`).emit("message", msg);
}
```

---

## Frontend Performance

### Virtualized Message Timeline
The `ChatMessageTimeline` component uses **React Virtuoso** for efficient rendering of long message histories:

- **Stick-to-bottom**: `followOutput` keeps the view pinned when new messages arrive
- **Prepend without jump**: `firstItemIndex` pattern (base index `100000 - groupCount`) enables loading older messages without scroll displacement
- **New messages pill**: `atBottomStateChange` tracks scroll position; a pill appears when new messages arrive while scrolled up
- **Message grouping**: Messages from the same author within 5 minutes are grouped; date separators and unread dividers are rendered as part of the virtual item list
- **Overscan**: 300px overscan with `increaseViewportBy: { top: 400, bottom: 200 }` for smooth scrolling

### Composer
- Textarea with emoji picker (emoji-picker-react) and file attachment support
- `@mention` popup with keyboard navigation (ArrowUp/Down, Enter/Tab to select, Escape to dismiss)
- Enter sends, Shift+Enter for newline

### Conventions
- Avoid `<Component<Type>>` JSX generics with Vite; use `data={items as Type[]}` casting instead
- Message types in `ChatMessageTimeline.tsx` include `tenantId?` and `_status: "pending" | "sent" | "failed"` for compatibility with the parent page's optimistic update model
- All interactive elements require `data-testid` attributes

---

## Related Documentation

- [Membership Rules](./MEMBERSHIP_RULES.md) - Channel/DM membership
- [Chat Debugging](./CHAT_DEBUGGING.md) - Debug mode and diagnostics
