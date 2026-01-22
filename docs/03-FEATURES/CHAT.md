# Chat System

**Status:** Current  
**Last Updated:** January 2026

Tenant-scoped Slack-like messaging with channels and direct messages.

## Features

- **Channels**: Public and private channels per tenant
- **Direct Messages**: 1-on-1 conversations between tenant users
- **Real-time**: Socket.IO for instant message delivery
- **File Attachments**: Upload files using hierarchical S3 storage
- **@Mentions**: Tag users with autocomplete support
- **Unread Tracking**: Badge indicators for unread messages
- **Message Search**: Full-text search across accessible conversations
- **Retention Policies**: Configurable message retention with archive

## Architecture

### Components

| Component | Location | Description |
|-----------|----------|-------------|
| Chat Page | `client/src/pages/chat.tsx` | Main chat UI |
| Socket Client | `client/src/lib/realtime/socket.ts` | WebSocket management |
| Socket Server | `server/realtime/socket.ts` | Room and event handling |
| Chat Routes | `server/routes/chat.ts` | REST API endpoints |

### Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `chat:newMessage` | Server→Client | New message in channel/DM |
| `chat:messageUpdated` | Server→Client | Message edited |
| `chat:messageDeleted` | Server→Client | Message deleted |
| `chat:memberAdded` | Server→Client | User joined channel |
| `chat:memberRemoved` | Server→Client | User left/removed from channel |
| `chat:conversationRead` | Server→Client | Conversation marked as read |

## Reliability Features

### Optimistic UI

Messages display immediately with status indicators:

| State | Icon | Description |
|-------|------|-------------|
| `pending` | Loader | Sending, not confirmed |
| `sent` | None | Confirmed by server |
| `failed` | Alert | Send failed, retry available |

### Reconnection Handling

- Infinite reconnection attempts with exponential backoff (1-5s)
- Automatic room rejoin on reconnect
- Connection status indicator in UI
- Toast notifications when removed from channels

### Stale Pending Cleanup

Messages stuck in `pending` for >2 minutes are marked `failed`.

### Duplicate Guards

- Client-side deduplication using message ID tracking
- Server-side unique constraint on messages

## Debugging

Enable debug mode with `CHAT_DEBUG=true` environment variable.

### Debug Endpoints (Super Admin only)

```
GET /api/v1/super/debug/chat/metrics     # Socket metrics
GET /api/v1/super/debug/chat/rooms       # Active rooms
GET /api/v1/super/debug/chat/connections # Connected clients
```

See [CHAT_DEBUGGING.md](../CHAT_DEBUGGING.md) for detailed debugging guide.

## Related Documentation

- [CHAT.md](../CHAT.md) - Full technical documentation
- [CHAT_DEBUGGING.md](../CHAT_DEBUGGING.md) - Debug mode guide
- [UPLOADS_S3.md](../UPLOADS_S3.md) - File attachment storage
