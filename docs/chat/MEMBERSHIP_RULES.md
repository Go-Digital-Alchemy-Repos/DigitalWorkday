# Chat Membership Rules

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Chat Architecture](./CHAT_ARCHITECTURE.md)

---

## Overview

Chat functionality is gated by membership. Users can only participate in channels/DMs where they are members.

---

## Channel Membership

### Visibility vs Participation
- **Visibility**: All tenant users can see public channel names
- **Participation**: Only members can send/receive messages

### Member Roles
| Role | Permissions |
|------|-------------|
| owner | Full control, can delete channel |
| admin | Manage members, edit channel |
| member | Send/receive messages |

### Adding Members
```typescript
await db.insert(chatChannelMembers).values({
  channelId,
  userId,
  role: "member",
});
```

---

## DM Membership

### Two-Party Only
DM threads have exactly two participants:

```typescript
// Find or create DM thread
const existingThread = await findDmThread(user1Id, user2Id, tenantId);
if (existingThread) return existingThread;

const [thread] = await db.insert(chatDmThreads).values({
  tenantId,
  user1Id,
  user2Id,
}).returning();
```

### Auto-Membership
Both users are automatically members when DM is created.

---

## Validation Flow

```typescript
// Before any chat operation:

// 1. Verify tenant match
if (channel.tenantId !== effectiveTenantId) {
  throw new ForbiddenError("Cross-tenant access denied");
}

// 2. Verify membership
const membership = await db.select()
  .from(chatChannelMembers)
  .where(and(
    eq(chatChannelMembers.channelId, channelId),
    eq(chatChannelMembers.userId, userId)
  ));

if (membership.length === 0) {
  throw new ForbiddenError("Not a member");
}
```

---

## Related Documentation

- [Chat Architecture](./CHAT_ARCHITECTURE.md)
- [Security Checklist](../security/SECURITY_CHECKLIST.md)
