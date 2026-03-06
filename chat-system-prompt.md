# Build a Real-Time Chat System (Slack-like)

Build a complete, production-ready real-time chat system for a multi-tenant web application. The system should support public and private channels, direct messages (1-on-1 and group), threaded replies, typing indicators, user presence, emoji reactions, file attachments, message pinning, @mentions, read receipts with unread badges, message search, AI-assisted features, and data retention/archival. The tech stack is React + TypeScript + Tailwind CSS + shadcn/ui on the frontend, Express.js + TypeScript on the backend, PostgreSQL with Drizzle ORM for the database, and Socket.IO for real-time communication.

---

## 1. Database Schema

Create the following tables using Drizzle ORM. All tables must include a `tenant_id` column referencing a `tenants` table (or your equivalent multi-tenant context table) and a `users` table for user references. Use `varchar` primary keys with `gen_random_uuid()` defaults.

### chat_channels
Stores group conversation metadata (both public and private).
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `name` (text, NOT NULL)
- `is_private` (boolean, default false, NOT NULL)
- `created_by` (varchar FK -> users, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `created_by`
- Unique: composite on (`tenant_id`, `lower(name)`) to prevent duplicate channel names per tenant

### chat_channel_members
Junction table tracking which users belong to which channels, with a role field.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `channel_id` (varchar FK -> chat_channels, NOT NULL)
- `user_id` (varchar FK -> users, NOT NULL)
- `role` (text, default "member", NOT NULL) — values: "owner", "member"
- `created_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `channel_id`, `user_id`
- Unique: composite on (`channel_id`, `user_id`)

### chat_dm_threads
Metadata for direct message conversations (1-on-1 or group DMs).
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Index: `tenant_id`

### chat_dm_members
Junction table for DM thread participants.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `dm_thread_id` (varchar FK -> chat_dm_threads, NOT NULL)
- `user_id` (varchar FK -> users, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `dm_thread_id`, `user_id`
- Unique: composite on (`dm_thread_id`, `user_id`)

### chat_messages
Central message table. Each message belongs to EITHER a channel OR a DM thread (never both). Supports single-level threading via `parent_message_id`. Soft-delete via `deleted_at`.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `channel_id` (varchar FK -> chat_channels, nullable)
- `dm_thread_id` (varchar FK -> chat_dm_threads, nullable)
- `author_user_id` (varchar FK -> users, NOT NULL)
- `body` (text, NOT NULL)
- `parent_message_id` (varchar, nullable) — for threaded replies (single-level only)
- `created_at` (timestamp, default now, NOT NULL)
- `edited_at` (timestamp, nullable)
- `deleted_at` (timestamp, nullable) — soft delete
- `deleted_by_user_id` (varchar FK -> users, nullable)
- `archived_at` (timestamp, nullable) — for data retention
- Indexes: `tenant_id`, `channel_id`, `dm_thread_id`, `author_user_id`, `created_at`, `archived_at`, `parent_message_id`
- Composite indexes: (`tenant_id`, `channel_id`, `created_at`), (`tenant_id`, `dm_thread_id`, `created_at`)

### chat_message_reactions
Emoji reactions on messages.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `message_id` (varchar FK -> chat_messages, NOT NULL)
- `user_id` (varchar FK -> users, NOT NULL)
- `emoji` (varchar(32), NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Unique: composite on (`message_id`, `user_id`, `emoji`) — one reaction per emoji per user per message
- Indexes: (`tenant_id`, `message_id`), `message_id`

### chat_attachments
File attachments uploaded to object storage (S3/R2) and linked to messages.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `message_id` (varchar FK -> chat_messages, nullable) — nullable until linked
- `s3_key` (text, NOT NULL)
- `url` (text, NOT NULL)
- `file_name` (text, NOT NULL)
- `mime_type` (text, NOT NULL)
- `size_bytes` (integer, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `message_id`

### chat_reads
Tracks the last read message per user per conversation for unread badge calculations.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `user_id` (varchar FK -> users, NOT NULL)
- `channel_id` (varchar FK -> chat_channels, nullable)
- `dm_thread_id` (varchar FK -> chat_dm_threads, nullable)
- `last_read_message_id` (varchar FK -> chat_messages, nullable)
- `last_read_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `user_id`, `channel_id`, `dm_thread_id`, (`user_id`, `channel_id`), (`user_id`, `dm_thread_id`)
- Unique: (`user_id`, `channel_id`), (`user_id`, `dm_thread_id`)

### chat_mentions
Tracks @mentions in messages for notifications and highlighting.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `message_id` (varchar FK -> chat_messages, NOT NULL)
- `mentioned_user_id` (varchar FK -> users, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Indexes: `tenant_id`, `message_id`, `mentioned_user_id`

### chat_pins
Pinned messages within channels.
- `id` (varchar PK, uuid default)
- `tenant_id` (varchar FK -> tenants, NOT NULL)
- `channel_id` (varchar FK -> chat_channels, NOT NULL)
- `message_id` (varchar FK -> chat_messages, NOT NULL)
- `pinned_by_user_id` (varchar FK -> users, NOT NULL)
- `created_at` (timestamp, default now, NOT NULL)
- Unique: (`channel_id`, `message_id`)
- Indexes: `tenant_id`, `channel_id`

### chat_export_jobs (optional)
Background export jobs for chat data backup before purging.
- `id` (varchar PK, uuid default)
- `requested_by_user_id` (varchar FK -> users, NOT NULL)
- `scope_type` (varchar(20), NOT NULL) — "tenant" or "all"
- `tenant_id` (varchar FK -> tenants, nullable)
- `cutoff_type` (varchar(20), NOT NULL) — "date" or "retention"
- `cutoff_date` (timestamp, nullable)
- `retain_days` (integer, nullable)
- `include_attachment_files` (boolean, default false, NOT NULL)
- `format` (varchar(10), default "jsonl", NOT NULL) — "jsonl", "json", "csv"
- `status` (varchar(20), default "queued", NOT NULL) — "queued", "processing", "completed", "failed"
- `progress` (jsonb, nullable)
- `output_location` (jsonb, nullable)
- `error` (text, nullable)
- `started_at`, `finished_at` (timestamps, nullable)
- `created_at`, `updated_at` (timestamps, default now)

---

## 2. Shared Event Contracts

Define shared TypeScript constants and interfaces in a `shared/events.ts` (or similar) file importable by both client and server. This is the single source of truth for all event names and payload shapes.

### Chat Events
```typescript
export const CHAT_EVENTS = {
  NEW_MESSAGE: 'chat:newMessage',
  MESSAGE_UPDATED: 'chat:messageUpdated',
  MESSAGE_DELETED: 'chat:messageDeleted',
  MESSAGE_REACTION: 'chat:messageReaction',
  CHANNEL_CREATED: 'chat:channelCreated',
  MEMBER_JOINED: 'chat:memberJoined',
  MEMBER_LEFT: 'chat:memberLeft',
  MEMBER_ADDED: 'chat:memberAdded',
  MEMBER_REMOVED: 'chat:memberRemoved',
  CONVERSATION_READ: 'chat:conversationRead',
  TYPING_UPDATE: 'chat:typing:update',
  THREAD_REPLY_CREATED: 'chat:thread:replyCreated',
  MESSAGE_PINNED: 'chat:messagePinned',
  MESSAGE_UNPINNED: 'chat:messageUnpinned',
} as const;

export const TYPING_EVENTS = {
  START: 'chat:typing:start',
  STOP: 'chat:typing:stop',
  UPDATE: 'chat:typing:update',
} as const;

export const CHAT_ROOM_EVENTS = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
  SEND: 'chat:send',
} as const;

export const PRESENCE_EVENTS = {
  PING: 'presence:ping',
  IDLE: 'presence:idle',
  UPDATE: 'presence:update',
  BULK_UPDATE: 'presence:bulkUpdate',
} as const;
```

### Payload Interfaces
Define typed interfaces for every event payload. Key payloads include:

- **ChatMessagePayload**: `{ id, tenantId, channelId, dmThreadId, authorUserId, body, parentMessageId, createdAt, editedAt, author?: { id, name, email, avatarUrl } }`
- **ChatNewMessagePayload**: `{ targetType: 'channel' | 'dm', targetId: string, message: ChatMessagePayload }`
- **ChatMessageUpdatedPayload**: `{ targetType, targetId, messageId, updates: Partial<ChatMessagePayload> }`
- **ChatMessageDeletedPayload**: `{ targetType, targetId, messageId, deletedByUserId }`
- **ChatMessageReactionPayload**: `{ targetType, targetId, messageId, userId, emoji, action: 'add' | 'remove', user?: { id, name, avatarUrl } }`
- **ChatPinPayload**: `{ channelId, messageId, pinnedByUserId, pinnedByName }`
- **ChatChannelCreatedPayload**: `{ channel: { id, tenantId, name, isPrivate, createdBy, createdAt } }`
- **ChatMemberJoinedPayload / ChatMemberLeftPayload / ChatMemberAddedPayload / ChatMemberRemovedPayload**: Member change events with userId, userName, targetType/targetId
- **ChatConversationReadPayload**: `{ targetType, targetId, userId, lastReadAt, lastReadMessageId }`
- **ChatTypingStartPayload / ChatTypingStopPayload**: `{ conversationId: string }` where conversationId is `"channel:{id}"` or `"dm:{id}"`
- **ChatTypingUpdatePayload**: `{ conversationId, userId, isTyping }`
- **ChatJoinPayload / ChatLeavePayload**: `{ targetType: 'channel' | 'dm', targetId: string }`
- **PresenceState**: `{ userId, status: 'online' | 'idle' | 'offline', online: boolean, lastSeenAt, lastActiveAt? }`

---

## 3. Backend Architecture

### 3.1 Chat Repository (`server/storage/chat.repo.ts`)
Create a centralized repository with all database queries for chat entities. This module handles:
- Channel CRUD: create, get by ID, list for tenant, update, delete
- Channel member management: add/remove members, list members, check membership
- DM thread management: create or find existing thread between users, list user's DMs
- Message CRUD: create, get by ID, list messages for channel/DM (paginated, with author joins), edit (with 5-minute window enforcement), soft delete
- Thread replies: list replies for a parent message
- Reactions: add/remove (toggle pattern), list reactions for message
- Attachments: create, link to message, list for message
- Read tracking: upsert last-read position, get unread counts per conversation
- Mentions: create, list for user
- Pins: pin/unpin, list pinned messages for channel
- Search: full-text search across messages the user has access to

All queries must include `tenantId` scoping for multi-tenant isolation.

### 3.2 API Routes

Organize under a `/api/chat` prefix with sub-routers. Apply authentication middleware (`authTenant` policy) to all routes.

#### Channels Router (`/api/chat/channels`)
- `GET /channels` — List channels the user can see (all public + private ones they're a member of)
- `POST /channels` — Create a new channel (creator auto-added as "owner" member)
- `GET /channels/:channelId` — Get channel details
- `GET /channels/:channelId/messages` — Get paginated messages (with `?before=messageId&limit=50` cursor pagination)
- `GET /channels/:channelId/members` — List channel members
- `POST /channels/:channelId/members` — Add a member (admin/owner only for private channels)
- `DELETE /channels/:channelId/members/:userId` — Remove a member
- `POST /channels/:channelId/join` — Join a public channel
- `POST /channels/:channelId/leave` — Leave a channel
- `GET /channels/:channelId/unread` — Get unread count for this channel

#### DM Router (`/api/chat/dm`)
- `GET /dm` — List user's DM threads (with last message preview, other participant info)
- `POST /dm` — Create or find existing DM thread (pass `userIds` array; reuses existing thread if same participants exist)
- `GET /dm/:dmThreadId/messages` — Get paginated messages for DM thread
- `GET /dm/:dmThreadId/members` — List DM participants

#### Messages Router (`/api/chat/messages`)
- `POST /messages` — Send a message (to channel or DM, optionally as a thread reply via `parentMessageId`)
- `PATCH /messages/:messageId` — Edit message body (only by author, within 5-minute window)
- `DELETE /messages/:messageId` — Soft-delete a message (by author or admin)
- `POST /messages/:messageId/reactions` — Toggle an emoji reaction
- `POST /messages/:messageId/read` — Mark conversation as read up to this message
- `GET /messages/:messageId/thread` — Get thread replies for a parent message
- `POST /messages/:messageId/pin` — Pin a message
- `DELETE /messages/:messageId/pin` — Unpin a message
- `POST /messages/upload` — Upload a file attachment (to S3/R2, returns attachment metadata)

#### Search Router (`/api/chat/search`)
- `GET /search?q=term&channelId=optional` — Search messages across accessible conversations

#### AI Router (`/api/chat/ai`) (optional)
- `POST /ai/summarize` — Summarize a channel or thread
- `POST /ai/draft-reply` — Generate a reply draft with tone selection (professional, casual, etc.)
- `POST /ai/convert-to-task` — Extract task from message content

### 3.3 Security Layer

Create a security module (`server/features/chat/security/`) with:

#### Chat Policy (`chatPolicy.ts`)
- `extractChatContext(req)` — Extract `{ tenantId, userId }` from the authenticated request
- `isChatAdmin(tenantId, userId)` — Check if user has admin role
- `isChannelOwner(channelId, userId)` — Check if user created the channel
- `logSecurityEvent(event, ctx, details)` — Log security-sensitive actions

#### Membership Enforcement (`membership.ts`)
- `requireChannelMember(tenantId, userId, channelId)` — Throws if user can't access channel (public channels pass through; private channels require membership)
- `requireChannelMemberStrict(tenantId, userId, channelId)` — Always requires membership record (used for actions like posting)
- `requireDmMember(tenantId, userId, dmThreadId)` — Throws if user is not a DM participant
- `resolveMessageContainer(messageId, tenantId)` — Returns `{ type: 'channel' | 'dm', id, tenantId }` for a given message
- `requireMessageAccess(tenantId, userId, messageId)` — Combines resolution + membership check

#### Socket Policy (`socketPolicy.ts`)
Middleware for Socket.IO events that validates:
- User is authenticated (has valid session)
- User belongs to the correct tenant
- User has membership to the channel/DM they're trying to join or interact with
- Uses an in-memory membership cache (with TTL) for performance, with an `invalidateMembershipCache()` function called when membership changes

### 3.4 Message Sending Flow
When a message is sent (via HTTP POST):
1. Validate authentication and tenant context
2. Validate membership (channel or DM)
3. Insert message into database
4. If `parentMessageId` is provided, validate parent exists and belongs to same conversation
5. Insert any @mentions into `chat_mentions` table
6. Broadcast `CHAT_EVENTS.NEW_MESSAGE` (or `THREAD_REPLY_CREATED` for thread replies) via Socket.IO to the conversation room
7. Trigger notification creation for mentioned users and DM participants
8. Return the full message object (with author details) for optimistic UI confirmation

---

## 4. Real-Time System (Socket.IO)

### 4.1 Server Initialization
- Attach Socket.IO to the Express HTTP server
- Enable CORS with credentials for session cookie authentication
- Enable connection state recovery (2-minute window for brief disconnections)
- Use Express session middleware in Socket.IO handshake to authenticate connections:
  ```
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, () => {
      passportMiddleware(socket.request, {}, next);
    });
  });
  ```
- Extract `userId` and `tenantId` from `socket.request.session` after authentication

### 4.2 Room Strategy
On connection, each socket automatically joins:
- `tenant:{tenantId}` — For tenant-wide broadcasts (presence updates, channel creation)
- `user:{userId}` — For user-specific events (notifications, DM alerts)

When a user opens a conversation, the client emits `chat:join`:
- `chat:channel:{channelId}` — For channel messages
- `chat:dm:{dmThreadId}` — For DM messages

When leaving a conversation view, emit `chat:leave` to leave the room.

### 4.3 Centralized Event Emitters (`server/realtime/events.ts`)
ALL socket event emissions MUST go through centralized emitter functions (never emit directly from route handlers). This ensures consistent payloads and single-point-of-control for real-time updates.

Key emitters:
- `emitChatNewMessage(targetType, targetId, message)` — Broadcasts to conversation room
- `emitChatMessageUpdated(targetType, targetId, messageId, updates)` — Broadcasts edit
- `emitChatMessageDeleted(targetType, targetId, messageId, deletedBy)` — Broadcasts deletion
- `emitChatReaction(targetType, targetId, messageId, userId, emoji, action)` — Broadcasts reaction toggle
- `emitChatTypingUpdate(conversationId, userId, isTyping)` — Broadcasts typing state
- `emitChatConversationRead(targetType, targetId, userId, lastReadAt, lastReadMessageId)` — Syncs read state
- `emitChatChannelCreated(channel)` — Broadcasts to tenant room
- `emitChatMemberJoined/Left/Added/Removed(...)` — Member change events
- `emitPresenceUpdate(tenantId, presenceState)` — Broadcasts to tenant room

### 4.4 Presence System (`server/realtime/presence.ts`)
In-memory tracking (no database persistence needed). Uses a Map keyed by `${tenantId}:${userId}`.

Each entry tracks: `{ activeSocketCount, lastSeenAt, lastActiveAt, status }`.

Status values:
- `"online"` — Has active socket(s) and recent activity
- `"idle"` — Has active socket(s) but no activity for N minutes
- `"offline"` — No active sockets

Key functions:
- `markConnected(tenantId, userId)` — Increment socket count, set online
- `markDisconnected(tenantId, userId)` — Decrement socket count, set offline if zero
- `recordPing(tenantId, userId)` — Update lastSeenAt/lastActiveAt
- `setIdle(tenantId, userId)` — Mark as idle (client sends `presence:idle` event)
- `getOnlineUsersForTenant(tenantId)` — Returns all online/idle users
- `startPresenceCleanup()` — Periodic interval (every 30s) to expire stale entries
- `onUserOffline(callback)` — Hook for side effects when user goes offline

On connect: emit bulk presence update to the newly connected client.
On status change: broadcast `PRESENCE_EVENTS.UPDATE` to the tenant room.

### 4.5 Typing Indicators (`server/realtime/typing.ts`)
Purely in-memory, no database. Uses Maps for fast lookup.

Data structures:
- `typingState`: Map<conversationId, Map<userId, TypingEntry>> — Who is typing where
- `socketConversations`: Map<socketId, Set<conversationId>> — For cleanup on disconnect
- `socketUserMap`: Map<socketId, { userId, tenantId }> — For socket-to-user resolution

Key behaviors:
- Typing auto-expires after 5 seconds without refresh
- Client sends `TYPING_EVENTS.START` repeatedly while typing (throttled to every 2-3 seconds)
- Client sends `TYPING_EVENTS.STOP` when input is cleared or message is sent
- On disconnect, all typing state for that socket is cleaned up
- `startTypingCleanup()` — Periodic interval (every 2s) to expire stale typing entries and emit stop events

---

## 5. Frontend Architecture

### 5.1 Chat Page (`client/src/pages/chat.tsx`)
The main chat page with a multi-panel layout:
- **Left panel**: Conversation list (channels + DMs)
- **Center panel**: Active message timeline + composer
- **Right panel** (toggleable): Thread panel or context panel (members, files, etc.)

Key responsibilities:
- Manages active conversation state (which channel/DM is selected)
- Sets up Socket.IO listeners for all chat events on mount
- Handles room join/leave when active conversation changes
- Manages message state (optimistic updates on send, real-time appends on receive)
- Handles mark-as-read logic (auto-marks on scroll to bottom / focus)

### 5.2 URL-Based State (`ChatLayout.tsx`)
Use URL query parameters for conversation selection to enable deep linking:
- `/chat?c=channel:{channelId}` — Open a specific channel
- `/chat?c=dm:{dmThreadId}` — Open a specific DM

Parse with: `const [type, id] = param.split(":");`

### 5.3 Conversation List Panel
Displays all accessible channels and DM threads in a scrollable sidebar:
- Channels section with public/private indicators
- DMs section with participant avatars and presence dots
- Unread badge counts per conversation
- Last message preview text
- Search/filter input at the top
- "Create Channel" and "New DM" action buttons

### 5.4 Message Timeline
A virtualized message list using `react-virtuoso` for performance:
- Messages grouped by author and time (consecutive messages from same author within 5 minutes are collapsed)
- Date separator headers between different days
- Each message shows: avatar, author name, timestamp, body text, reactions, attachment previews, thread reply count
- Supports image lightbox preview and PDF preview modal for attachments
- Right-click context menu or hover actions: reply in thread, react, edit (own messages, within 5 min), delete (own or admin), pin/unpin
- Soft-deleted messages show "[This message was deleted]" placeholder
- Auto-scroll to bottom on new messages (unless user has scrolled up)
- "Load more" / infinite scroll for older messages (cursor-based pagination using `?before=messageId`)

### 5.5 Message Input / Composer
A rich input component at the bottom of the message area:
- Multi-line text input with Shift+Enter for newlines, Enter to send
- Markdown-style formatting support (bold, italic, lists)
- Emoji picker button (use a library like `emoji-mart` or similar)
- File attachment button (triggers file upload to server, then attaches to message)
- @mention autocomplete: typing `@` shows a dropdown of channel/DM members filtered by input
- Slash command support: typing `/` shows a dropdown of available commands
- Maintains sticky focus (doesn't lose focus when clicking other UI elements)

### 5.6 Thread Panel
A slide-in right panel for threaded conversations:
- Shows the parent message at the top
- Lists all replies below (same message rendering as timeline)
- Has its own composer at the bottom for adding replies
- Thread reply count badge shown on the parent message in the main timeline
- When a thread reply arrives via Socket.IO, update both the thread panel and the reply count badge

### 5.7 Typing Indicators Hook (`use-typing.tsx`)
A React context/hook that manages typing state:
- Emits `TYPING_EVENTS.START` when user types in the composer (throttled to every 2-3 seconds)
- Emits `TYPING_EVENTS.STOP` when user clears input, sends message, or after 3 seconds of inactivity
- Listens for `TYPING_EVENTS.UPDATE` from server to know who else is typing
- Returns `typingUsers` array for the current conversation
- Display: "Alice is typing…" or "Alice and Bob are typing…" or "3 people are typing…"

### 5.8 Presence Hook (`use-presence.tsx`)
A React context/hook for user online/idle/offline tracking:
- On mount, sends periodic `presence:ping` events (every 25 seconds)
- Detects user idle state (no mouse/keyboard activity for 5 minutes) and sends `presence:idle`
- Returns to `online` on activity after idle
- Listens for `PRESENCE_EVENTS.UPDATE` and `PRESENCE_EVENTS.BULK_UPDATE` from server
- Provides `getPresence(userId)` function returning current status
- Provides `onlineUsers` map for the tenant

### 5.9 Presence Indicator Component
A small visual dot/ring component for user avatars:
- Green dot: online
- Yellow/orange dot: idle
- Gray dot or no dot: offline
- Use on avatar components throughout the app, not just in chat

### 5.10 AI Assist Panel (optional)
A collapsible panel or modal for AI features:
- "Summarize" button for channels and threads
- "Draft Reply" with tone selector (Professional, Casual, Friendly, Concise)
- "Convert to Task" option on individual messages
- Loading states during AI processing
- Results displayed inline with copy/use actions

### 5.11 Global Chat Drawer (optional)
A draggable, persistent mini-chat interface accessible from anywhere in the app:
- Accessible via sidebar icon or floating action button
- Shows condensed conversation list and active chat
- Supports all core features (send, receive, react, threads)
- Can be minimized/maximized
- Maintains separate Socket.IO room management from the full chat page

---

## 6. Data Retention & Archival

### Soft Archive System
- Messages are never hard-deleted by the retention system; they get an `archived_at` timestamp
- Tenant admins configure retention policies (e.g., "archive messages older than 90 days")
- A background job runs periodically (e.g., daily) to sweep messages past the retention window
- Archived messages are excluded from normal message queries but can be exported
- Export jobs create downloadable files (JSONL/CSV) of archived data before permanent purge

### Chat Retention Settings
- Per-tenant configuration for retention days
- Admin-only UI for viewing and updating retention policies
- Admin endpoint for triggering manual exports

---

## 7. Rate Limiting & Performance

- Apply rate limiting to message sending (e.g., 30 messages per minute per user)
- Use database indexes extensively (see schema above)
- Paginate all list endpoints (channels, messages, members)
- Use cursor-based pagination for messages (`?before=messageId&limit=50`)
- Consider in-memory caching for:
  - Membership lookups (used on every Socket.IO event)
  - Presence state (already in-memory by design)
  - Typing state (already in-memory by design)

---

## 8. Key Implementation Patterns

1. **Tenant Isolation**: Every database query and socket room is strictly scoped by `tenantId`. Never allow cross-tenant data access.

2. **Optimistic Updates**: When sending a message, immediately add it to the local message list with a temporary ID. Replace with the server-confirmed message when the API response returns. This makes the UI feel instant.

3. **Event-Driven Side Effects**: HTTP route handlers perform the database write, then call centralized emitter functions to broadcast via Socket.IO. Never emit Socket.IO events directly from route handlers.

4. **Message Edit Window**: Enforce a 5-minute edit window server-side. After 5 minutes from `created_at`, reject edit requests with a 403.

5. **Soft Deletion**: Messages are soft-deleted (set `deleted_at` + `deleted_by_user_id`). The frontend renders deleted messages as a placeholder: "[This message was deleted]".

6. **Unread Tracking**: On the backend, compare `chat_reads.last_read_message_id` against the latest message in each conversation to compute unread counts. On the frontend, call the mark-as-read endpoint when the user scrolls to the bottom of a conversation.

7. **Security Audit Logging**: Log security-sensitive events (private channel joins, membership changes, admin actions) with `logSecurityEvent()`.

8. **Socket Room Cleanup**: When a user disconnects, clean up:
   - Typing state for all conversations
   - Socket-to-room mappings
   - Membership cache entries
   - Presence state (decrement socket count, go offline if zero)

---

## 9. File Structure

```
shared/
  events.ts              # Shared event constants and payload interfaces

server/
  realtime/
    socket.ts            # Socket.IO initialization, auth, room management
    events.ts            # Centralized event emitters
    presence.ts          # In-memory presence tracking
    typing.ts            # In-memory typing indicator state
    socketPolicy.ts      # Socket event membership validation middleware
  
  http/domains/chat/
    index.ts             # Router aggregator (mount sub-routers, apply auth policy)
    channels.routes.ts   # Channel CRUD, member management
    messages.routes.ts   # Message CRUD, reactions, uploads, read tracking
    dm.routes.ts         # DM thread management
    search.routes.ts     # Message search
    ai.routes.ts         # AI-assisted features (optional)
  
  features/chat/security/
    chatPolicy.ts        # Context extraction, admin checks, audit logging
    membership.ts        # Membership enforcement functions
    scopedChatRepo.ts    # Tenant-scoped repository wrapper (optional)
  
  storage/
    chat.repo.ts         # All database queries for chat entities
  
  retention/
    softArchiveRunner.ts # Background job for message archival
    retentionScheduler.ts # Scheduling for retention jobs

client/src/
  pages/
    chat.tsx             # Main chat page

  features/chat/
    ChatLayout.tsx           # URL state management for conversations
    ChatMessageTimeline.tsx  # Virtualized message list
    ConversationListPanel.tsx # Channel/DM sidebar list
    ThreadPanel.tsx          # Threaded replies panel
    ChatContextPanel.tsx     # Channel info, members, shared files
    ChatAIAssist.tsx         # AI features UI (optional)
    PinnedMessagesPanel.tsx  # Pinned messages view
    ImageLightbox.tsx        # Image attachment preview
    PdfPreviewModal.tsx      # PDF attachment preview
    slashCommands.ts         # Slash command definitions

  components/
    chat-message-input.tsx   # Message composer
    global-chat-drawer.tsx   # Persistent mini-chat drawer (optional)
    ui/presence-indicator.tsx # Online/idle/offline dot component

  hooks/
    use-typing.tsx           # Typing indicator state management
    use-presence.tsx          # User presence tracking

  lib/realtime/
    socket.ts                # Client-side Socket.IO connection management
```

---

## 10. Getting Started Sequence

1. Define the database schema tables in your shared schema file
2. Run database migrations to create the tables
3. Build the chat repository with all database queries
4. Set up Socket.IO server initialization with session-based authentication
5. Build the presence and typing indicator in-memory systems
6. Create the security/membership enforcement layer
7. Build the API routes (channels, messages, DMs, search)
8. Wire up centralized Socket.IO event emitters called from route handlers
9. Build the frontend chat page with conversation list, message timeline, and composer
10. Add Socket.IO client listeners for real-time updates
11. Implement typing indicators and presence on the frontend
12. Add thread panel, reactions, pins, and @mentions
13. Add file attachment upload and preview
14. Add unread tracking and badge counts
15. (Optional) Add AI-assisted features
16. (Optional) Add data retention/archival system
17. (Optional) Add global chat drawer

This prompt describes the complete system. Adapt the multi-tenant aspects (tenantId scoping) to your application's auth model. If your app is single-tenant, you can omit the `tenant_id` columns and tenant-scoping logic throughout.
