# Tenant Scope Hardening — Security Guide

## Overview

This document describes the tenant data isolation hardening implemented across the MyWorkDay platform. The goal is to make **tenantId always present and always enforced** mechanically, preventing cross-tenant data leakage.

## Architecture

### Enforcement Modes

Controlled via `TENANCY_ENFORCEMENT` environment variable:

| Mode | Reads | Writes | Behavior |
|------|-------|--------|----------|
| `off` | Unscoped allowed | Unscoped allowed | Development only |
| `soft` | Warns on unscoped | Warns on missing tenantId | Migration period — logs violations |
| `strict` | Blocks cross-tenant | Blocks tenant-less writes | Production target |

### Tenant-Scoped Storage Facade

`server/storage/tenantScoped.ts` provides a `TenantScopedStorage` class that wraps the raw storage interface. All tenant-domain operations require tenantId and route through the `*WithTenant` / `*ByIdAndTenant` storage methods.

```typescript
import { getTenantScopedStorage } from "../storage/tenantScoped";

router.get("/projects/:id", async (req, res) => {
  const scoped = getTenantScopedStorage(req);
  const project = await scoped.getProject(req.params.id);
  // Automatically scoped to the request's tenant
});
```

### Runtime Guards

Located in `server/lib/tenancyGuards.ts`:

- **`assertTenantIdOnInsert(payload, table)`** — Blocks writes without tenantId in strict mode; warns in soft mode.
- **`assertTenantScopedRead(entityTenantId, expectedTenantId, type, id)`** — Blocks cross-tenant reads; warns on NULL tenantId entities.
- **`assertTenantScopedWrite(payload, expectedTenantId, table)`** — Validates payload tenantId matches expected; blocks mismatches.

### Static Analysis

`scripts/tenancy-scan.sh` uses ripgrep to detect unscoped storage method calls in route handlers. It has an allowlist for super-admin and system-level code that legitimately needs unscoped access.

```bash
bash scripts/tenancy-scan.sh        # Full scan with details
bash scripts/tenancy-scan.sh --quiet # Exit code only (CI)
```

## Tenant-Owned Data Domains

The following tables require tenantId for all operations:

| Domain | Tables |
|--------|--------|
| Projects | `projects`, `sections` |
| Tasks | `tasks`, `subtasks`, `task_attachments` |
| Clients | `clients`, `client_contacts`, `client_invites` |
| Time Tracking | `time_entries`, `active_timers` |
| Chat | `chat_channels`, `chat_messages`, `chat_dm_threads` |
| Activity | `activity_log` |
| Tags | `tags` |

## Backfill Verification Plan

### Step 1: Identify NULL tenantId Rows

```sql
-- Count NULL tenantId rows per table
SELECT 'projects' as tbl, COUNT(*) as null_count FROM projects WHERE tenant_id IS NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks WHERE tenant_id IS NULL
UNION ALL
SELECT 'clients', COUNT(*) FROM clients WHERE tenant_id IS NULL
UNION ALL
SELECT 'time_entries', COUNT(*) FROM time_entries WHERE tenant_id IS NULL
UNION ALL
SELECT 'sections', COUNT(*) FROM sections WHERE tenant_id IS NULL
UNION ALL
SELECT 'tags', COUNT(*) FROM tags WHERE tenant_id IS NULL
UNION ALL
SELECT 'comments', COUNT(*) FROM comments WHERE tenant_id IS NULL
UNION ALL
SELECT 'activity_log', COUNT(*) FROM activity_log WHERE tenant_id IS NULL;
```

### Step 2: Backfill Using Workspace → Tenant Mapping

```sql
-- Backfill projects via workspace → tenant
UPDATE projects p
SET tenant_id = w.tenant_id
FROM workspaces w
WHERE p.workspace_id = w.id
  AND p.tenant_id IS NULL
  AND w.tenant_id IS NOT NULL;

-- Backfill tasks via project → workspace → tenant
UPDATE tasks t
SET tenant_id = p.tenant_id
FROM projects p
WHERE t.project_id = p.id
  AND t.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Backfill clients via workspace → tenant
UPDATE clients c
SET tenant_id = w.tenant_id
FROM workspaces w
WHERE c.workspace_id = w.id
  AND c.tenant_id IS NULL
  AND w.tenant_id IS NOT NULL;

-- Backfill time_entries via workspace → tenant
UPDATE time_entries te
SET tenant_id = w.tenant_id
FROM workspaces w
WHERE te.workspace_id = w.id
  AND te.tenant_id IS NULL
  AND w.tenant_id IS NOT NULL;
```

### Step 3: Verify

```sql
-- Should all return 0 after backfill
SELECT 'projects' as tbl, COUNT(*) FROM projects WHERE tenant_id IS NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks WHERE tenant_id IS NULL
UNION ALL
SELECT 'clients', COUNT(*) FROM clients WHERE tenant_id IS NULL
UNION ALL
SELECT 'time_entries', COUNT(*) FROM time_entries WHERE tenant_id IS NULL;
```

### Step 4: Enable Strict Mode

Once all NULL rows are resolved:

```
TENANCY_ENFORCEMENT=strict
```

## Super-User Override

Super users (role=`super_user`) can access any tenant's data via `X-Tenant-Id` header. The `getEffectiveTenantId()` function handles this:

1. If user is super_user and `X-Tenant-Id` header is present → use header value
2. Otherwise → use `user.tenantId`

The scoped storage respects this by using whatever `getEffectiveTenantId()` returns.

## Rollback Safety

- All changes are additive — no schema changes, no column drops
- Setting `TENANCY_ENFORCEMENT=off` disables all new guards
- The `TenantScopedStorage` falls back to unscoped methods when tenantId is empty and mode is not strict
- Existing unscoped IStorage methods remain available for system-level code
