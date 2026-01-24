# Chat System Documentation

## Overview

MyWorkDay includes a tenant-scoped Slack-like chat system with channels and direct messages. The chat system uses Socket.IO for real-time messaging with session-based authentication.

## Architecture

### Components

- **Client Socket** (`client/src/lib/realtime/socket.ts`): Manages Socket.IO connection with automatic reconnection
- **Server Socket** (`server/realtime/socket.ts`): Handles room management and event broadcasting
- **Chat Routes** (`server/routes/chat.ts`): REST API for CRUD operations
- **Chat Page** (`client/src/pages/chat.tsx`): Main chat UI with channels, DMs, and message display

### Event Types (from `shared/events/index.ts`)

| Event | Description |
|-------|-------------|
| `chat:newMessage` | New message received in channel/DM |
| `chat:messageUpdated` | Message was edited |
| `chat:messageDeleted` | Message was deleted |
| `chat:channelCreated` | New channel created |
| `chat:memberJoined` | User joined a channel (tenant-level) |
| `chat:memberLeft` | User left or was removed from channel (tenant-level) |
| `chat:memberAdded` | User added to channel (channel room level, richer info) |
| `chat:memberRemoved` | User removed from channel (channel room level, richer info) |
| `chat:conversationRead` | User marked conversation as read |
| `connection:connected` | Server ack with serverTime and requestId |

## Message Lifecycle

### Sending a Message

1. **Optimistic Insert**: Message added to UI immediately with `_status: 'pending'` and unique `_tempId`
2. **API Request**: POST to `/api/v1/chat/channels/:channelId/messages` or `/api/v1/chat/dm/:dmId/messages`
3. **Server Processing**: Message persisted to database with server-generated `id` and `createdAt`
4. **Socket Broadcast**: Server emits `chat:newMessage` to channel/DM room
5. **Reconciliation**: Client matches incoming message to pending message by body+recency, replaces with confirmed message
6. **Failure Handling**: If API fails, message marked `_status: 'failed'` with retry button

### Message States

| State | Description | UI Treatment |
|-------|-------------|--------------|
| `pending` | Sent but not confirmed | Loader icon, greyed |
| `sent` | Confirmed by server | Normal display |
| `failed` | Send failed | Alert icon, retry/remove buttons |

### Stale Pending Cleanup

Messages stuck in `pending` state for >2 minutes are automatically marked as `failed`.

## Socket Reconnection Rules

### Automatic Reconnection

- Socket.IO configured with infinite reconnection attempts
- Reconnection delay: 1-5 seconds (exponential backoff)
- Connection timeout: 20 seconds

### Room Rejoin on Reconnect

1. Client tracks all joined chat rooms in `joinedChatRooms` Set
2. On `connect` event, all tracked rooms are automatically rejoined
3. Server validates room access using authenticated session data

### Connection State Tracking

```typescript
import { isSocketConnected, onConnectionChange } from '@/lib/realtime/socket';

// Check current state
const connected = isSocketConnected();

// Subscribe to changes
const unsubscribe = onConnectionChange((connected) => {
  console.log('Connection:', connected ? 'online' : 'offline');
});
```

### Server Connected Ack

On connection, server emits `connection:connected` with:
- `serverTime`: ISO timestamp for clock sync
- `requestId`: Unique connection ID for debugging
- `userId`: Authenticated user ID
- `tenantId`: User's tenant ID

## Membership Sync

### Adding Members

1. POST `/api/v1/chat/channels/:channelId/members` with `{ userIds: [...] }`
2. Server validates caller is channel member
3. Server emits `chat:memberJoined` (tenant-level) and `chat:memberAdded` (room-level)
4. Client invalidates members list query

### Removing Members

1. DELETE `/api/v1/chat/channels/:channelId/members/:userId`
2. Server validates permissions (self-remove, owner, or admin)
3. Server emits `chat:memberLeft` and `chat:memberRemoved`
4. If removed user is current user:
   - Socket room left immediately
   - Channel deselected
   - Toast notification shown
   - Channel list refreshed

### Permission Model

- Users can always remove themselves (leave)
- Channel creator can remove anyone
- Channel owners (role=owner) can remove anyone
- Tenant admins can remove anyone

## Ordering Guarantees

Messages are always sorted by:
1. `createdAt` timestamp (server-generated)
2. `id` (UUID string comparison for same-timestamp messages)

Client time is never used for ordering.

## Cache Invalidation (TanStack Query)

### On New Message
- Invalidate channel list (for last message preview)
- Invalidate DM list

### On Membership Change
- Invalidate channel members list
- Invalidate channel list (if user was added/removed)

## Duplicate Prevention

### Client-Side Guards

- `seenMessageIds` Set tracks all processed message IDs
- Duplicate socket events are ignored

### Server-Side Guards

- Room join requests check if already in room
- Message IDs are UUIDs (collision-resistant)

## Security

### Tenant Isolation

- All chat operations require valid tenant context
- Channel/DM access validated against tenant membership
- Socket room joins validated using server-derived userId (not client-supplied)

### Authentication

- Session-based authentication via Passport.js
- Socket connections inherit session from HTTP handshake
- Unauthenticated sockets cannot join chat rooms

## Railway Deployment Checklist

### Pre-Deployment

1. Ensure DATABASE_URL is configured
2. Verify SESSION_SECRET is set
3. Check Socket.IO connection URL matches production domain

### Post-Deployment

1. Test socket connection from deployed client
2. Verify room join/leave works
3. Test message send/receive
4. Test reconnection (disable network briefly)
5. Verify member add/remove with multi-user test

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | Session encryption key |
| NODE_ENV | Recommended | Set to `production` |

## Troubleshooting

### Messages Not Appearing

1. Check browser console for socket connection status
2. Verify user has access to channel/DM
3. Check server logs for room join validation

### Reconnection Issues

1. Check network connectivity
2. Verify session is still valid (not expired)
3. Check server logs for authentication errors

### Duplicate Messages

1. Should be prevented by `seenMessageIds` guard
2. If occurring, check for multiple socket connections (multiple tabs)
3. Verify socket event handlers are properly cleaned up on unmount

## UX Guidelines

### Conversation List Sidebar

- **Last Message Preview**: Each channel/DM shows truncated last message (30 chars max)
- **Relative Timestamps**: Shows "now", "5m", "2h", "3d", or "Jan 15" format
- **Unread Badge**: Red badge with count, caps at "99+" for large counts
- **Active Highlight**: Selected conversation has `bg-sidebar-accent` background
- **Empty States**: 
  - Channels: Shows "No channels yet" with "Create Channel" CTA button
  - DMs: Shows "No conversations yet" with "Start New Chat" CTA button

### Conversation Header

- **Channel Name + Member Count**: Shows "#channel-name 5 members"
- **Members Button**: Opens member management drawer with text label
- **DM Name + Count**: Shows participant names and member count
- **Connection Status**: Shows "Reconnecting..." indicator when offline

### Message Composer

- **Enter to Send**: Press Enter to send message immediately
- **Shift+Enter for Newline**: Creates new line in the message (uses auto-sizing Textarea)
- **Disabled When Empty**: Send button disabled when message is empty and no attachments
- **Auto-Focus**: Message input automatically focuses when conversation is selected
- **Sending Indicator**: Pending messages show "Sending..." with spinner icon

### Loading States

- **Skeleton Loaders**: 
  - Channels list: 3 skeleton items with icon + text placeholders
  - DMs list: 3 skeleton items with avatar + text placeholders
  - Messages: 3 skeleton items with avatar + message content placeholders
- **Error States**: Show error icon, message, and "Retry" button
- **Empty Messages**: Shows welcome icon and "Be the first to send a message!" text

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Escape` | Cancel editing |

### Accessibility

- All interactive elements have `data-testid` attributes for testing
- Buttons have appropriate aria labels
- Loading states announce via skeleton animations
- Error messages are visible and actionable

## Read Tracking

### Overview

The chat system tracks per-user read status for each conversation using the `chat_reads` table. This enables:
- Unread badge counts in the conversation list
- "Seen" indicators for DMs (shows when other users have read messages)
- Real-time updates via socket events

### Database Schema

```sql
chat_reads (
  id: varchar (primary key)
  tenant_id: varchar (references tenants.id)
  user_id: varchar (references users.id)
  channel_id: varchar (references chat_channels.id, nullable)
  dm_thread_id: varchar (references chat_dm_threads.id, nullable)
  last_read_message_id: varchar (references chat_messages.id)
  last_read_at: timestamp
)
```

Unique constraints:
- `(user_id, channel_id)` - One read record per user per channel
- `(user_id, dm_thread_id)` - One read record per user per DM thread

### API

#### Mark Conversation as Read

```
POST /api/v1/chat/reads
{
  targetType: "channel" | "dm",
  targetId: string,
  lastReadMessageId: string
}
```

Response: `{ success: true }`

After marking as read, the server emits `chat:conversationRead` event to the conversation room.

### Socket Events

#### `chat:conversationRead` Payload

```typescript
interface ChatConversationReadPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  lastReadAt: Date;
  lastReadMessageId: string;
}
```

### Client Behavior

1. **Auto-mark Read**: When messages are loaded in a conversation, the client automatically calls `/api/v1/chat/reads` with the last message ID
2. **Optimistic Updates**: On receiving `chat:conversationRead` for the current user, unread counts are set to 0 via `setQueryData`
3. **Seen Indicator**: In DMs, when receiving `chat:conversationRead` from another user, a "Seen" indicator appears after the last message

### UI Elements

- **Unread Badge**: Red badge with count (caps at "99+") shown in conversation list
- **Seen Indicator**: Double-check icon with "Seen" text after last DM message (only shown when other user has read it)

### Tests

- `unread_counts_drop_after_read_event.test.ts`: Verifies unread counts reset on read events
- `read_event_emits_socket_update.test.ts`: Verifies socket event emission and payload structure

## Message Search

### Overview

The chat system includes a message search feature that allows users to find messages across all their accessible conversations. Search is tenant-scoped and respects channel/DM membership.

### API

#### Search Messages

```
GET /api/v1/chat/search?q=<query>&limit=50&offset=0
```

Query parameters:
- `q` (required): Search query (minimum 2 characters)
- `channelId` (optional): Filter to specific channel
- `dmThreadId` (optional): Filter to specific DM thread
- `fromUserId` (optional): Filter by message author
- `limit` (optional): Max results, default 50, max 100
- `offset` (optional): Pagination offset, default 0

Response:
```json
{
  "messages": [
    {
      "id": "msg-123",
      "body": "message content with search term...",
      "createdAt": "2026-01-22T10:00:00Z",
      "editedAt": null,
      "channelId": "ch-456",
      "dmThreadId": null,
      "channelName": "general",
      "author": {
        "id": "user-789",
        "email": "user@example.com",
        "displayName": "John Doe"
      }
    }
  ],
  "total": 42
}
```

### Security

- **Tenant Isolation**: Searches only within the user's tenant
- **Membership Scoping**: Only returns messages from:
  - Channels the user is a member of
  - DM threads the user participates in
- **Soft-deleted Messages**: Excluded from search results
- **Archived Messages**: Excluded from search results

### UI

- **Sidebar Search Input**: Search field in the chat sidebar header
- **Search Dialog**: Opens automatically when typing 2+ characters
- **Result Display**: Shows message snippet, author, conversation badge, and timestamp
- **Navigation**: Clicking a result opens the conversation and closes the dialog

### Performance

The search uses ILIKE pattern matching with the following optimizations:
- **Compound indexes** for scoped searches (defined in schema):
  - `chat_messages_tenant_channel_created_idx` on (tenant_id, channel_id, created_at)
  - `chat_messages_tenant_dm_created_idx` on (tenant_id, dm_thread_id, created_at)
- Tenant ID index for fast tenant filtering
- Channel/DM thread indexes for membership filtering
- Result limit (default 50, max 100)
- Proper query scoping before text matching (filters by accessible conversations first)

#### Optional: GIN Trigram Index

For improved text search performance on large datasets, you can add a GIN trigram index:

```sql
-- Enable the pg_trgm extension (run once per database)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for fast ILIKE pattern matching
CREATE INDEX CONCURRENTLY chat_messages_body_trgm_idx 
  ON chat_messages USING gin (body gin_trgm_ops);
```

This index significantly speeds up ILIKE queries for message body searches.

### Tests

- `search_scoped_to_membership.test.ts`: Verifies search respects channel/DM membership
- `search_opens_conversation.test.tsx`: Verifies clicking results opens correct conversation

---

## Chat Attachments

Chat supports file attachments via S3 storage with tenant isolation.

### Upload UI

The message composer includes:
- **Paperclip Button**: Click to select files from file picker
- **Drag and Drop**: Drag files directly onto the composer area

### Supported File Types

- Documents: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT
- Images: PNG, JPG, JPEG, WebP
- Archives: ZIP

Maximum file size: 25MB per file

### Upload Flow

1. User selects or drops files
2. Files are uploaded to S3 via `POST /api/v1/chat/uploads`
3. Attachments appear as pending in the composer
4. User can remove pending attachments before sending
5. On send, attachment IDs are included in the message payload
6. Attachments are linked to the message in the database

### Message Display

Messages with attachments show:
- **Images**: Thumbnail preview (clickable to open full size)
- **Other Files**: Icon, filename, and size with download link

### API

#### Upload Attachment

```
POST /api/v1/chat/uploads
Content-Type: multipart/form-data
```

Form data field: `file`

Response:
```json
{
  "id": "attachment-uuid",
  "fileName": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 102400,
  "url": "https://bucket.s3.region.amazonaws.com/...",
  "storageSource": "tenant"
}
```

#### Send Message with Attachments

```
POST /api/v1/chat/channels/:channelId/messages
{
  "body": "Check these files",
  "attachmentIds": ["att-1", "att-2"]
}
```

### Security

- **Tenant Isolation**: S3 keys include tenant ID, attachments validated on upload
- **Single-use**: Each attachment can only be linked to one message
- **Cross-tenant Rejection**: Attempting to use attachments from another tenant fails

### Tests

- `attachment_upload_scoped_to_tenant.test.ts`: Verifies tenant isolation
- `message_with_attachment_renders.test.tsx`: Verifies attachment display in messages

See also: `/docs/UPLOADS_S3.md` for S3 configuration and storage provider details.
