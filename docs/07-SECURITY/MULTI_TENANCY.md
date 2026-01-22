# Multi-Tenancy Security

**Status:** Current  
**Last Updated:** January 2026

Complete guide to tenant isolation and data security.

## Overview

MyWorkDay implements application-layer multi-tenancy with strict data isolation between tenants. Each tenant's data is completely separated from other tenants.

## Tenancy Enforcement Modes

Set via `TENANCY_ENFORCEMENT` environment variable:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `off` | No enforcement | Development only |
| `soft` | Log violations, don't block | Migration period |
| `strict` | Block cross-tenant access | Production |

## Tenant Context

Every authenticated request has tenant context:

```typescript
req.tenant = {
  tenantId: string | null,      // User's home tenant
  effectiveTenantId: string,    // Active tenant (may differ for super users)
  isSuperUser: boolean,         // Super admin flag
  isImpersonating: boolean      // Acting as another user
};
```

### Context Resolution

1. User authenticates
2. `tenantContextMiddleware` sets initial context
3. Super users can override with `X-Tenant-Id` header
4. All database queries filter by `effectiveTenantId`

## Data Scoping

### Tenant-Scoped Tables

All business data includes `tenantId`:

- workspaces, projects, tasks, clients
- teams, users (tenant users)
- time_entries, comments, attachments
- chat_channels, chat_messages

### Global Tables

Some tables are tenant-agnostic:

- tenants (the tenants themselves)
- super user accounts
- system configuration
- error_logs (super admin only)

## Access Control Layers

### 1. Route Guards

```typescript
// Require tenant context
router.use(requireTenantContext);

// Require admin role
router.use(requireTenantAdmin);
```

### 2. Storage Layer

```typescript
// All queries include tenant filter
const clients = await db.select()
  .from(clientsTable)
  .where(eq(clientsTable.tenantId, tenantId));
```

### 3. Division-Based Access

For granular control within tenants:

```typescript
const scope = await getEffectiveDivisionScope(userId, tenantId);
// Returns 'ALL' for admins, or array of division IDs for employees
```

## Super User Access

Super admins can:

- View any tenant's data (with audit logging)
- "Act as Tenant" for management tasks
- Impersonate tenant users (with session tracking)

All super user cross-tenant actions are logged.

## Client-Side Isolation

### Query Key Namespacing

```typescript
// Include tenant in query keys for cache isolation
queryKey: ['/api/clients', tenantId]
```

### Tenant Context Gate

`TenantContextGate` component prevents stale data on tenant switch:

```tsx
<TenantContextGate>
  <TenantLayout />
</TenantContextGate>
```

## Common Vulnerabilities Prevented

| Attack | Prevention |
|--------|------------|
| IDOR | Tenant validation on all resource access |
| Cache poisoning | Query key includes tenant ID |
| Session fixation | Session invalidation on tenant switch |
| Privilege escalation | Role checked per-request, not cached |

## Related Documentation

- [SECURITY_TENANCY.md](../SECURITY_TENANCY.md) - Implementation details
- [TENANT_DATA_VISIBILITY.md](./TENANT_DATA_VISIBILITY.md) - Data visibility rules
- [DIVISIONS.md](../DIVISIONS.md) - Division-based access control
