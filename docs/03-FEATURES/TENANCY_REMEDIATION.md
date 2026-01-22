# Tenancy Remediation Guide

This document describes how to identify and fix tenant_id drift in the database.

## Current State Summary

After running the tenancy scan, the following tables have rows with NULL tenant_id:

| Table | NULL Count | Remediation Strategy |
|-------|------------|---------------------|
| workspaces | 1 | Manual: Assign to tenant or delete |
| teams | 3 | Auto-backfill after workspace is fixed |
| users | 2* | Manual: Assign to tenant or delete |

*Note: super_user role users correctly have NULL tenant_id by design.

## Running the Remediation Script

### Prerequisites

1. Ensure `BACKFILL_TENANT_IDS_ALLOWED=true` is set for apply mode
2. Always run dry-run first to preview changes

### Command Line

```bash
# Dry run (preview only)
npx tsx server/scripts/tenancyRemediate.ts --dry-run

# Apply changes
npx tsx server/scripts/tenancyRemediate.ts
```

### API Endpoint

The Super Admin Debug Tools panel provides a UI for this:

- **Dry Run**: Preview what would be backfilled
- **Apply**: Apply backfill (requires `X-Confirm-Backfill: APPLY_TENANTID_BACKFILL` header)

## Manual Remediation Steps

### Step 1: Fix Root Causes First

The workspace without tenant_id is the root cause for the teams drift.

```sql
-- Option A: Assign demo workspace to an existing tenant
UPDATE workspaces 
SET tenant_id = 'YOUR_TENANT_ID' 
WHERE id = 'demo-workspace-id';

-- Option B: Delete orphaned demo data (if not needed)
-- First delete dependent teams
DELETE FROM teams WHERE workspace_id = 'demo-workspace-id';
-- Then delete workspace
DELETE FROM workspaces WHERE id = 'demo-workspace-id';
```

### Step 2: Fix Orphaned Users

```sql
-- View orphaned employees
SELECT id, email, role FROM users 
WHERE tenant_id IS NULL AND role != 'super_user';

-- Option A: Assign to a tenant
UPDATE users 
SET tenant_id = 'YOUR_TENANT_ID' 
WHERE id IN ('user-id-1', 'user-id-2');

-- Option B: Delete test users
DELETE FROM users 
WHERE email LIKE '%@test.com' AND tenant_id IS NULL;
```

### Step 3: Run Backfill

After fixing root causes, run the backfill to propagate tenant_id through relationships:

```bash
npx tsx server/scripts/tenancyRemediate.ts
```

### Step 4: Verify

```sql
-- Check for any remaining NULL tenant_id
SELECT 'workspaces' as t, COUNT(*) FROM workspaces WHERE tenant_id IS NULL
UNION ALL SELECT 'teams', COUNT(*) FROM teams WHERE tenant_id IS NULL
UNION ALL SELECT 'clients', COUNT(*) FROM clients WHERE tenant_id IS NULL
UNION ALL SELECT 'projects', COUNT(*) FROM projects WHERE tenant_id IS NULL
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks WHERE tenant_id IS NULL
UNION ALL SELECT 'users', COUNT(*) FROM users WHERE tenant_id IS NULL AND role != 'super_user';
```

## Adding NOT NULL Constraints

Once ALL tables have zero NULL tenant_id rows (except super_users), you can add NOT NULL constraints:

```sql
-- Only after ALL tables are clean:
ALTER TABLE workspaces ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE teams ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN tenant_id SET NOT NULL;
-- etc.
```

**IMPORTANT**: Do NOT add NOT NULL while there are unresolved rows.

## Preventing Future Drift

1. **assertTenantId utility**: Use in all create operations
   ```typescript
   import { assertTenantId } from "@/lib/errors";
   
   const tenantId = assertTenantId(req.effectiveTenantId, "creating task");
   await storage.createTask({ ...data, tenantId });
   ```

2. **Tenancy Enforcement Mode**: Set `TENANCY_ENFORCEMENT=strict` in production

3. **Super Admin Acting as Tenant**: Always ensure "Act as Tenant" mode is active when creating records

## Related Files

- `server/scripts/tenancyRemediate.ts` - CLI backfill script
- `server/routes/superDebug.ts` - API backfill endpoint
- `server/middleware/tenancyEnforcement.ts` - Runtime enforcement
- `server/lib/errors.ts` - assertTenantId utility
