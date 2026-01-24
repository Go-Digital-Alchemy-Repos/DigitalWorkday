# Primary Workspace

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Tenant Lifecycle](./TENANT_LIFECYCLE.md), [User Provisioning](./USER_PROVISIONING.md)

---

## Overview

Every tenant has a **primary workspace** that serves as the default location for entity creation during provisioning. This ensures consistent data placement and simplifies the provisioning flow.

---

## The Primary Workspace Pattern

### Why Primary Workspace Exists

1. **Consistency**: All provisioning flows create entities in the same workspace
2. **Simplicity**: No need to ask "which workspace?" during setup
3. **Reliability**: Explicit errors if workspace missing (vs silent failures)

### Primary Workspace Helper

All provisioning flows use the `getPrimaryWorkspaceIdOrFail` helper:

```typescript
// server/storage.ts
async getPrimaryWorkspaceIdOrFail(
  tenantId: string, 
  requestId?: string
): Promise<string> {
  const workspaces = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.tenantId, tenantId));
  
  const primary = workspaces.find(w => w.isPrimary) || workspaces[0];
  
  if (!primary) {
    const errorMsg = `[getPrimaryWorkspaceIdOrFail] No workspace found for tenant ${tenantId}`;
    if (requestId) {
      console.error(`${errorMsg} (requestId: ${requestId})`);
    } else {
      console.error(errorMsg);
    }
    throw new Error(`Tenant ${tenantId} has no workspace`);
  }
  
  return primary.id;
}
```

---

## Provisioning Flows Using Primary Workspace

All these flows use `getPrimaryWorkspaceIdOrFail`:

### User Provisioning
- Direct user creation
- Invitation activation
- Bulk CSV import

### Client Provisioning
- Direct client creation
- CSV import
- Orphan client fixing

### Project Provisioning
- Project imports
- Welcome project seeding

### Time Entry Import
- Bulk time entry imports

---

## Implementation Example

```typescript
// Example: Creating a client during provisioning
router.post("/tenants/:tenantId/users", async (req, res) => {
  const { tenantId } = req.params;
  const requestId = req.headers["x-request-id"] as string | undefined;
  
  // Get primary workspace (throws if not found)
  const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(
    tenantId, 
    requestId
  );
  
  // Create user with workspace membership
  const user = await db.insert(schema.users).values({
    tenantId,
    email: req.body.email,
    // ...
  }).returning();
  
  // Add to primary workspace
  await db.insert(schema.workspaceMembers).values({
    workspaceId: primaryWorkspaceId,
    userId: user.id,
    role: "member",
  });
  
  // Audit log
  await recordTenantAuditEvent(
    tenantId,
    "user_created",
    `User ${user.email} created`,
    req.user?.id,
    { userId: user.id }
  );
  
  return res.json(user);
});
```

---

## Error Handling

When no primary workspace exists:

1. Helper throws explicit error
2. Error includes tenant ID for debugging
3. Request ID is logged if available
4. API returns 400 "Tenant has no workspace"

```typescript
// Client sees:
{
  "error": "Tenant has no workspace"
}

// Server logs:
// [getPrimaryWorkspaceIdOrFail] No workspace found for tenant abc123 (requestId: xyz789)
```

---

## Workspace Creation

Primary workspace is created during tenant setup:

```typescript
// During tenant creation
const tenant = await db.insert(schema.tenants).values({
  name: tenantName,
  slug: tenantSlug,
}).returning();

// Create primary workspace
await db.insert(schema.workspaces).values({
  tenantId: tenant.id,
  name: "Main Workspace",
  isPrimary: true,
});
```

---

## What NOT to Do

### Never Skip the Helper
```typescript
// WRONG - Manual query without error handling
const workspaces = await db.select().from(schema.workspaces)
  .where(eq(schema.workspaces.tenantId, tenantId));
const workspaceId = workspaces[0]?.id; // Could be undefined!

// CORRECT - Use helper
const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
```

### Never Assume Workspace Exists
```typescript
// WRONG - No null check
await db.insert(schema.clients).values({
  workspaceId: workspace.id, // Could fail silently
});

// CORRECT - Helper throws if missing
const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId);
await db.insert(schema.clients).values({
  workspaceId, // Guaranteed to exist
});
```

---

## Related Documentation

- [Tenant Lifecycle](./TENANT_LIFECYCLE.md) - When workspaces are created
- [User Provisioning](./USER_PROVISIONING.md) - User creation flows
