# Chat Security Architecture

## Overview

The chat subsystem enforces **RLS-like** (Row-Level Security) access control at the data layer, preventing cross-tenant data leaks and unauthorized access to private channels, DM threads, and individual messages.

## Security Layers

```
Request  ──>  HTTP middleware (auth + tenant)
         ──>  chatPolicy.ts   (context extraction + admin checks)
         ──>  membership.ts   (channel/DM/message access guards)
         ──>  scopedChatRepo  (tenant-scoped data access wrapper)
         ──>  Database
```

### 1. chatPolicy.ts — Context & Admin Checks

| Export | Purpose |
|---|---|
| `extractChatContext(req)` | Extracts `{ tenantId, userId }` from the authenticated request. Throws if tenant context is missing. |
| `isChatAdmin(tenantId, userId)` | Returns `true` if the user has `admin` or `super_admin` role **within the given tenant**. Cross-tenant admins return `false`. |
| `isChannelOwner(channelId, userId)` | Checks if the user created the channel. |
| `logSecurityEvent(event, ctx, details)` | Structured audit log for denied access, policy violations, and security-relevant events. |

### 2. membership.ts — Access Guards

These helpers enforce the core access rules. All throw `AppError` (404 or 403) on denial — never leaking resource existence across tenants.

| Helper | Rule |
|---|---|
| `requireChannelMember(tenantId, userId, channelId)` | Public channels: any tenant member allowed. Private channels: explicit membership required. Cross-tenant: 404. |
| `requireChannelMemberStrict(tenantId, userId, channelId)` | Requires explicit `chatChannelMembers` row even for public channels. Used for member-list and management endpoints. |
| `requireDmMember(tenantId, userId, dmThreadId)` | Verifies both tenant scoping and `chatDmMembers` membership. |
| `resolveMessageContainer(messageId, tenantId)` | Finds the channel or DM thread a message belongs to, scoped to tenant. Returns `{ type, id, tenantId }`. |
| `requireMessageAccess(tenantId, userId, messageId)` | Resolves the message container, then enforces membership on that container. |

### 3. scopedChatRepo.ts — Tenant-Scoped Data Access

`ScopedChatRepo` wraps `storage.*` calls with automatic tenant + membership enforcement.

```typescript
const repo = createScopedChatRepo(tenantId, userId);

// All of these enforce tenantId match and membership:
await repo.getChannelScoped(channelId);          // tenant check only
await repo.getChannelWithMemberCheck(channelId); // tenant + membership
await repo.getMessageWithAccessCheck(messageId); // tenant + container membership
await repo.getDmThreadWithMemberCheck(dmId);     // tenant + DM membership
```

**Factory**: `createScopedChatRepo(tenantId, userId)` — creates a repo instance bound to the caller's security context.

## HTTP Route Hardening

All chat HTTP routes use `extractChatContext` + membership helpers before data access:

| Endpoint | Guard |
|---|---|
| `GET /channels/:channelId` | `requireChannelMember` |
| `GET /channels/:channelId/members` | `requireChannelMember` + `requireChannelMemberStrict` for private channels |
| `PATCH /messages/:messageId` | `requireMessageAccess` + author check |
| `DELETE /messages/:messageId` | `requireMessageAccess` + author/admin check |
| `GET /messages/:messageId/thread` | `requireMessageAccess` |
| `GET /messages/:messageId/reactions` | `requireMessageAccess` |
| `POST /messages/:messageId/reactions` | `requireMessageAccess` |
| `DELETE /messages/:messageId/reactions/:emoji` | `requireMessageAccess` |
| `GET /dm/:dmId` | `requireDmMember` |
| `GET /dm/:dmId/messages` | `requireDmMember` |
| `GET /dm/:dmId/first-unread` | `requireDmMember` |
| `POST /dm/:dmId/messages` | `requireDmMember` |
| `GET /dm/:dmThreadId/thread-summaries` | `requireDmMember` |

## Socket Hardening

| Control | Implementation |
|---|---|
| Room join authorization | `requireChatRoomAccess` policy in `withSocketPolicy` — validates channel/DM membership before allowing socket room join |
| Room join rate limit | Max 50 chat rooms per socket connection — prevents resource exhaustion |
| Membership cache | Per-socket membership cache with TTL, invalidated on room leave and disconnect |
| Typing authorization | `requireChatMembership` policy check before broadcasting typing events |
| Server-derived identity | Socket context uses server-side `userId`/`tenantId` from session — ignores client-supplied IDs |

## Security Invariants

1. **No cross-tenant data access**: Every query is scoped to `tenantId`. Cross-tenant requests receive 404 (not 403) to avoid leaking resource existence.
2. **Private channel isolation**: Non-members of private channels cannot read messages, list members, or react to messages.
3. **DM thread isolation**: Only participants can access DM threads and their messages.
4. **Message-level access**: Edit/delete/react operations resolve the message's container and enforce membership on that container.
5. **Admin escalation**: Chat admins can delete messages but cannot bypass tenant boundaries.
6. **Socket identity**: All socket events use server-derived identity from the authenticated session.

## Testing

Tests are in `server/tests/chat-security-membership.test.ts` (27 test cases):

- Cross-tenant denial for channels, DMs, and messages
- Private channel isolation for non-members
- Public channel access for tenant members
- DM thread membership enforcement
- Message container resolution with tenant scoping
- Scoped repository access checks
- Admin role verification with cross-tenant denial
- 404 responses for cross-tenant probes (no existence leaks)

Run: `npx vitest run server/tests/chat-security-membership.test.ts`

## Adding New Endpoints

When adding new chat endpoints:

1. Call `extractChatContext(req)` to get `{ tenantId, userId }`
2. Use the appropriate membership helper before any data access
3. For message operations, use `requireMessageAccess` which handles both container resolution and membership
4. For admin-only operations, additionally call `isChatAdmin`
5. Log denials via `logSecurityEvent` for audit trail
