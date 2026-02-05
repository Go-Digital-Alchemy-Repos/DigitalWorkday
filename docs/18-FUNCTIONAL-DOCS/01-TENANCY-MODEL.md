# Tenancy Model

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The tenancy model defines how data isolation works in MyWorkDay. Every tenant (organization) has their own isolated data space. The `tenantId` field is the primary mechanism for data segregation across all tenant-scoped tables.

---

## Who Uses It

| Role | Access Level |
|------|--------------|
| **Super Admin** | Can view/manage all tenants, access cross-tenant data |
| **Admin** | Manages their own tenant's data only |
| **Manager** | Works within their tenant's scope |
| **Member** | Works within their tenant's scope |
| **Viewer** | Read-only access within tenant scope |

---

## Data Model

### Core Tenancy Fields

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | UUID | Foreign key to `tenants` table, required on all tenant-scoped rows |
| `id` | UUID | Primary key for the tenant record |
| `name` | string | Tenant organization name |
| `subdomain` | string | Optional subdomain for white-label |
| `createdAt` | timestamp | When tenant was created |

### Tenant-Scoped Tables

All of the following tables require `tenantId`:
- `users` (except super_users)
- `projects`
- `tasks`
- `clients`
- `teams`
- `workspaces`
- `time_entries`
- `active_timers`
- `comments`
- `activity_logs`
- `notifications`
- `documents`
- `client_notes`

---

## Key Flows

### 1. TenantId Derivation

```
Request → tenantContext middleware → getEffectiveTenantId(req)
                                          ↓
                            Returns: req.tenantId (from session)
                                     or req.headers['x-tenant-id'] (for super admin)
```

### 2. Data Access Pattern

```typescript
// All queries must include tenantId filter
const projects = await storage.getProjectsByTenantId(tenantId);

// Insert guards prevent missing tenantId
assertInsertHasTenantId(data); // Throws if tenantId missing
```

### 3. New Tenant Onboarding

1. Super Admin creates tenant via `/api/v1/super/tenants`
2. First user registration sets up default workspace/team
3. Invitation flow for additional users

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Super user without tenantId** | Allowed - super users are platform-level |
| **Missing tenantId on insert** | `assertInsertHasTenantId` throws `TENANT_REQUIRED` error |
| **Orphaned rows** | Backfill script: `npx tsx server/scripts/backfillTenantId.ts` |
| **Cross-tenant access attempt** | 403 Forbidden - middleware blocks |
| **Tenant deletion** | Soft delete with cascade options |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Create Tenant** | Super Admin > Tenants | Create new organization |
| **View Tenants** | Super Admin > Tenants | List all tenants with health status |
| **Tenant Health** | Super Admin > Tenant Health | Check for orphaned/misconfigured data |
| **Backfill Tool** | Super Admin > Tenant Health | Repair missing tenantId values |
| **Impersonation** | Super Admin header | Switch tenant context via X-Tenant-Id |

---

## Related Documentation

- [Security & Tenancy](../SECURITY_TENANCY.md)
- [Tenant Health Repair](../TENANT_HEALTH_REPAIR.md)
- [Tenancy Security Checklist](../TENANCY_SECURITY_CHECKLIST.md)
