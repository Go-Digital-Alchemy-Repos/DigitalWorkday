# Tenant Enforcement — Security Architecture

## Overview

MyWorkDay is a multi-tenant application. Every tenant-owned entity (projects, tasks, clients, time entries, etc.) is scoped by `tenant_id`. The tenant enforcement system provides mechanical guarantees that cross-tenant data access is impossible.

## Enforcement Modes

Controlled by the `TENANCY_ENFORCEMENT` environment variable:

| Mode     | Default In  | Behavior |
|----------|-------------|----------|
| `strict` | Development | Missing `tenantId` throws `TENANT_SCOPE_REQUIRED`. Cross-tenant access throws `TENANCY_VIOLATION`. |
| `soft`   | —           | Logs warnings but allows operations. Records to `tenancyHealthTracker`. |
| `off`    | Production  | No enforcement. Legacy fallback behavior. |

**Defaults:**
- **Development** (`NODE_ENV !== "production"`): `strict`
- **Production** (`NODE_ENV === "production"`): `off` (until verified safe to enable)

Override: `TENANCY_ENFORCEMENT=strict` or `TENANCY_ENFORCEMENT=off`

## Architecture Components

### BaseTenantRepository (`server/storage/baseTenantRepository.ts`)

Abstract base class for all tenant-scoped repositories:

```ts
class MyRepo extends BaseTenantRepository {
  async getItem(id: string, tenantId: string) {
    const tid = this.requireTenantId(tenantId, "MyRepo.getItem");
    // tid is guaranteed non-empty in strict mode
  }
}
```

Methods:
- `requireTenantId(tenantId, operation)` — Asserts tenantId is present
- `assertTenantMatch(resourceTenantId, expectedTenantId, type, id)` — Prevents cross-tenant access

### TenantScopedStorage (`server/storage/tenantScoped.ts`)

Request-scoped wrapper that extracts tenant context from the HTTP request and delegates to storage methods with tenant enforcement.

### Tenancy Guards (`server/lib/tenancyGuards.ts`)

Runtime guards for:
- `assertTenantIdOnInsert` — Validates tenant_id on writes
- `assertTenantScopedRead` — Validates tenant ownership on reads
- `assertTenantScopedWrite` — Validates tenant context on mutations
- `assertNoClientTenantId` — Prevents client-supplied tenantId
- `assertTenantOwnership` — Validates resource belongs to tenant

### Tenancy Enforcement Middleware (`server/middleware/tenancyEnforcement.ts`)

Provides `getTenancyEnforcementMode()`, `isStrictMode()`, validation functions for INSERT/UPDATE/DELETE operations, and the `requireTenantContext()` middleware factory.

## Tenant-Owned Tables

These tables MUST always be scoped by `tenant_id`:

- `projects`
- `tasks`
- `clients`
- `time_entries`
- `active_timers`
- `comments`
- `subtasks`
- `task_attachments`
- `chat_channels`
- `chat_messages`
- `chat_dm_threads`
- `activity_log`
- `sections`
- `tags`

## DB Indexes

Performance indexes added for tenant-scoped queries:

- `idx_tasks_tenant_id` — `tasks(tenant_id)`
- `idx_projects_tenant_id` — `projects(tenant_id)`
- `idx_time_entries_tenant_id` — `time_entries(tenant_id)`
- `idx_clients_tenant_id` — `clients(tenant_id)`
- Composite indexes for common join patterns (tenant + project, tenant + workspace, etc.)

## Audit Script

Run the static analysis audit:

```bash
npx tsx script/auditTenantScope.ts
```

Checks for:
- Direct `db.select().from(table)` without tenant filter
- `db.update()/delete()` on tenant tables without tenant filter
- Route handlers missing `getEffectiveTenantId` or tenant context

**CI Integration:** Add to your CI pipeline as a non-blocking check:
```yaml
# CI step placeholder
- name: Tenant scope audit
  run: npx tsx script/auditTenantScope.ts
  continue-on-error: true
```

## Rollout Plan

1. **Phase 1 (Current):** `strict` in development, `off` in production
2. **Phase 2:** Enable `soft` in production, monitor warnings
3. **Phase 3:** Enable `strict` in production after verifying zero warnings
4. **Phase 4:** Remove `off` mode entirely
