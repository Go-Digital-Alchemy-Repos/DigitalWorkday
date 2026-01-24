# Tenant Lifecycle

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Primary Workspace](./PRIMARY_WORKSPACE.md), [User Provisioning](./USER_PROVISIONING.md)

---

## Overview

This document describes the complete lifecycle of a tenant from creation to potential deactivation.

---

## Tenant States

```
PENDING → ONBOARDING → ACTIVE → SUSPENDED → DELETED
              ↓
           ACTIVE
```

| State | Description |
|-------|-------------|
| PENDING | Tenant created, awaiting admin setup |
| ONBOARDING | Admin going through setup wizard |
| ACTIVE | Fully operational |
| SUSPENDED | Temporarily disabled (billing, violation) |
| DELETED | Soft-deleted, data retained |

---

## Creation Flow

### 1. Super Admin Creates Tenant

```typescript
// POST /api/v1/super/tenants
const result = await storage.createTenantWithWorkspace({
  name: "Acme Corp",
  slug: "acme-corp",
});

// Result includes:
// - tenant: { id, name, slug, ... }
// - primaryWorkspace: { id, name, isPrimary: true }
```

### 2. Primary Workspace Created Automatically

Every tenant gets a primary workspace during creation:

```typescript
// Inside createTenantWithWorkspace
const [tenant] = await db.insert(tenants).values({
  name,
  slug,
  status: "pending",
}).returning();

const [workspace] = await db.insert(workspaces).values({
  tenantId: tenant.id,
  name: "Main Workspace",
  isPrimary: true,
}).returning();
```

### 3. Initial Settings Created

```typescript
await db.insert(tenantSettings).values({
  tenantId: tenant.id,
  // Default settings
});
```

---

## Onboarding Wizard

### Step 1: Admin Account
- Create or assign tenant admin user
- Set password or send invite

### Step 2: Company Details
- Company name, logo, branding
- Industry, timezone

### Step 3: Initial Configuration
- Default project settings
- Notification preferences

### Step 4: Welcome Content
- Optional: Seed welcome project
- Optional: Import sample data

---

## Provisioning Operations

All provisioning uses the primary workspace pattern:

```typescript
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(
  tenantId,
  requestId
);

// Create user with workspace membership
await db.insert(users).values({
  tenantId,
  email,
  role: "employee",
});

await db.insert(workspaceMembers).values({
  workspaceId: primaryWorkspaceId,
  userId: newUser.id,
  role: "member",
});
```

---

## Audit Logging

All provisioning operations are audited:

```typescript
await recordTenantAuditEvent(
  tenantId,
  "user_created",
  `User ${email} created by super admin`,
  superAdminId,
  { userId: newUser.id }
);
```

---

## Deactivation

### Suspension
```typescript
// Suspend tenant (billing issue, violation)
await db.update(tenants)
  .set({ status: "suspended" })
  .where(eq(tenants.id, tenantId));

// Users cannot log in during suspension
```

### Deletion (Soft)
```typescript
// Soft delete - data retained
await db.update(tenants)
  .set({ 
    status: "deleted",
    deletedAt: new Date()
  })
  .where(eq(tenants.id, tenantId));
```

---

## Data Purge (Hard Delete)

Only super admins with explicit confirmation:

```typescript
// POST /api/v1/super/tenants/:id/purge
// Requires: { confirm: "DELETE ALL DATA" }

// Cascades through all tenant data
await purgeTenantData(tenantId);
```

---

## Related Documentation

- [Primary Workspace](./PRIMARY_WORKSPACE.md)
- [User Provisioning](./USER_PROVISIONING.md)
- [Tenancy Model](../architecture/TENANCY_MODEL.md)
