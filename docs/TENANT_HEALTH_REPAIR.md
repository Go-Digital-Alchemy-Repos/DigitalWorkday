# Tenant Health & Repair Tools

This document describes the Super Admin tools for diagnosing and safely repairing tenant data integrity issues.

## Overview

The Tenant Health & Repair system provides:

1. **Health Checks** - Read-only diagnostics to detect missing tenantId values and cross-tenant FK mismatches
2. **Repair Preview** - Dry-run mode showing what would be fixed
3. **Repair Apply** - Safe application of high-confidence fixes only
4. **Guardrails** - Server-side validation to prevent future orphan inserts

## Safety Rules

- **NO destructive operations** - Only updates to set tenantId; no deletes
- **Super Admin only** - All endpoints require super_user role
- **High-confidence only** - Repair-apply only fixes rows with unambiguous derivation
- **Explicit confirmation** - Repair-apply requires `X-Confirm-Repair: true` header
- **Full logging** - All repairs logged with requestId and actor userId

## Health Checks Performed

### 1. Missing TenantId Rows

Scans the following tables for rows with `tenant_id IS NULL`:

| Table | Notes |
|-------|-------|
| `users` | Excludes super_user role |
| `projects` | All projects |
| `tasks` | All tasks |
| `teams` | All teams |
| `clients` | All clients |
| `workspaces` | All workspaces |
| `time_entries` | All time entries |

### 2. Cross-Tenant FK Mismatches

Detects rows where a foreign key relationship crosses tenant boundaries:

- `projects.tenantId != clients.tenantId` (via clientId)
- `tasks.tenantId != projects.tenantId` (via projectId)
- `time_entries.tenantId != projects.tenantId` (via projectId)

### 3. Orphaned References

Detects broken foreign key references:

- Projects with clientId pointing to non-existent client
- Non-personal tasks with projectId pointing to non-existent project

## TenantId Derivation Rules

When a row is missing `tenantId`, we derive it from parent relationships:

### Projects

Priority order:
1. `clientId` → `clients.tenantId` (HIGH confidence if client exists and has tenantId)
2. `workspaceId` → `workspaces.tenantId` (HIGH confidence if workspace exists and has tenantId)

LOW confidence if:
- Both clientId and workspaceId chains are broken
- Parent records also have null tenantId

### Tasks

Priority order:
1. `projectId` → `projects.tenantId` (HIGH confidence for non-personal tasks)
2. `createdBy` → `users.tenantId` (HIGH confidence for personal tasks only)

LOW confidence if:
- projectId exists but project has null tenantId
- Personal task with no valid user tenantId

### Teams

Derivation path:
1. `workspaceId` → `workspaces.tenantId`

HIGH confidence if workspace has tenantId; LOW otherwise.

### Clients

Derivation path:
1. `workspaceId` → `workspaces.tenantId`

HIGH confidence if workspace has tenantId; LOW otherwise.

### Time Entries

Priority order:
1. `projectId` → `projects.tenantId`
2. `userId` → `users.tenantId`
3. `workspaceId` → `workspaces.tenantId`

HIGH confidence if any path succeeds; LOW otherwise.

## API Endpoints

### GET /api/v1/super/system/health/tenancy

Returns global health summary across all tenants.

**Response:**
```json
{
  "totalTenants": 5,
  "readyTenants": 3,
  "blockedTenants": 2,
  "totalOrphanRows": 15,
  "byTable": {
    "users": 0,
    "projects": 5,
    "tasks": 8,
    "teams": 2,
    "clients": 0,
    "workspaces": 0,
    "time_entries": 0
  }
}
```

### GET /api/v1/super/tenants/:tenantId/health

Returns health summary for a specific tenant (existing endpoint).

### POST /api/v1/super/system/health/tenancy/repair-preview

Generates a dry-run preview of proposed repairs.

**Request Body:**
```json
{
  "tenantId": "optional-uuid",
  "tables": ["projects", "tasks"],
  "limit": 500
}
```

**Response:**
```json
{
  "proposedUpdates": [
    {
      "table": "projects",
      "id": "project-uuid",
      "currentTenantId": null,
      "derivedTenantId": "tenant-uuid",
      "confidence": "high",
      "derivation": "clientId -> clients.tenantId",
      "notes": null
    }
  ],
  "highConfidenceCount": 10,
  "lowConfidenceCount": 2,
  "byTable": {
    "projects": { "high": 5, "low": 1 },
    "tasks": { "high": 5, "low": 1 }
  }
}
```

### POST /api/v1/super/system/health/tenancy/repair-apply

Applies high-confidence repairs only.

**Required Header:**
```
X-Confirm-Repair: true
```

**Request Body:**
```json
{
  "tenantId": "optional-uuid",
  "tables": ["projects", "tasks"],
  "limit": 500,
  "applyOnlyHighConfidence": true
}
```

**Response:**
```json
{
  "updatedCountByTable": {
    "projects": 5,
    "tasks": 8
  },
  "skippedLowConfidenceCountByTable": {
    "projects": 1,
    "tasks": 0
  },
  "sampleUpdatedIds": ["projects:uuid1", "tasks:uuid2"],
  "totalUpdated": 13,
  "totalSkipped": 1
}
```

## Using the UI

1. Navigate to **Super Admin → System Status → Repair Tools** tab
2. Review the **Global Overview Cards** showing tenant counts and orphan rows
3. Examine **Missing TenantId by Table** to identify affected tables
4. Click **Run Repair Preview (Dry Run)** to see proposed changes
5. Review the preview, noting HIGH vs LOW confidence labels
6. If satisfied, click **Apply High-Confidence Repairs**
7. Type "REPAIR" in the confirmation dialog
8. Review the results summary

## Interpreting "Manual Review Required"

When an update shows "low" confidence with notes "manual review required":

1. The derivation chain is broken (parent has null tenantId)
2. Multiple conflicting tenantIds could apply
3. No valid parent relationship exists

**To fix manually:**
1. Identify the correct tenant by inspecting related records
2. Use the Debug Tools or direct SQL to update the tenantId
3. Re-run repair preview to confirm the fix

## Running on Railway

```bash
# View current health status
curl -X GET https://your-app.railway.app/api/v1/super/system/health/tenancy \
  -H "Cookie: <session-cookie>"

# Generate repair preview
curl -X POST https://your-app.railway.app/api/v1/super/system/health/tenancy/repair-preview \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'

# Apply repairs (requires confirmation header)
curl -X POST https://your-app.railway.app/api/v1/super/system/health/tenancy/repair-apply \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -H "X-Confirm-Repair: true" \
  -d '{"limit": 100, "applyOnlyHighConfidence": true}'
```

## Guardrails

The following server-side validations prevent new orphan rows:

1. **Task Creation** - Validates projectId belongs to tenant before insert
2. **Task Creation** - Validates sectionId belongs to project before insert
3. **Project Creation** - tenantId derived from workspace automatically
4. **Client Creation** - tenantId derived from workspace automatically

These validations return standard API error responses with requestId for debugging.

## Verification Checklist

### After Running Repairs

- [ ] Re-run health check to confirm orphan count decreased
- [ ] Verify affected features work (task creation, project listing)
- [ ] Check error logs for any TENANCY_REPAIR_FAIL entries
- [ ] Review sample updated IDs to confirm correct tenant assignment

### Regression Testing

- [ ] Task creation works for admin and employee users
- [ ] Project creation assigns correct tenantId
- [ ] Time entry creation assigns correct tenantId
- [ ] Cross-tenant access is properly blocked
