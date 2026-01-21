# Tenant Data Visibility Policy

**Status:** Current  
**Last Updated:** January 2026  
**Related Docs:** [Tenant Isolation](./TENANT_ISOLATION.md), [Authorization](./AUTHORIZATION.md)

---

## Purpose

This document defines the **source of truth** for how data visibility works in MyWorkDay's multi-tenant architecture. It ensures that:

1. All tenant users can collaborate on shared resources
2. Sensitive data remains appropriately scoped
3. Future development does not accidentally reintroduce incorrect filters

**This is a policy document.** Backend enforcement is implemented in middleware and storage layers.

---

## Core Rule: Tenant Scope First, Role Second

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA ACCESS DECISION                      │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Is user authenticated?                              │
│     NO  → 401 Unauthorized                                   │
│     YES → Continue                                           │
├─────────────────────────────────────────────────────────────┤
│  Step 2: Does resource belong to user's tenant?              │
│     NO  → 403 Forbidden (or 404 Not Found)                   │
│     YES → Continue                                           │
├─────────────────────────────────────────────────────────────┤
│  Step 3: Does user have required role/permission?            │
│     NO  → 403 Forbidden                                      │
│     YES → Allow access                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** Tenant isolation is the PRIMARY security boundary. Role-based access is SECONDARY.

---

## Shared Tenant Data

The following resources are **visible to ALL users within a tenant**:

| Resource | Visibility | Rationale |
|----------|------------|-----------|
| **Clients** | Tenant-wide | All employees need client context |
| **Projects** | Tenant-wide | Collaboration requires project visibility |
| **Workspaces** | Tenant-wide | Organizational structure is shared |
| **Tasks** | Tenant-wide | Team collaboration on tasks |
| **Subtasks** | Tenant-wide | Part of task hierarchy |
| **Teams** | Tenant-wide | Team membership is visible |
| **Tags** | Tenant-wide | Consistent tagging across tenant |
| **Sections** | Tenant-wide | Project organization is shared |

### DO: Query by tenantId Only

```sql
-- CORRECT: All tenant users can see all clients
SELECT * FROM clients 
WHERE tenant_id = :tenantId;

-- CORRECT: All tenant users can see all projects
SELECT * FROM projects 
WHERE tenant_id = :tenantId;

-- CORRECT: All tenant users can see all tasks
SELECT * FROM tasks 
WHERE tenant_id = :tenantId 
  AND project_id = :projectId;
```

### DO NOT: Add userId Filter to Shared Data

```sql
-- WRONG: This incorrectly restricts client visibility
SELECT * FROM clients 
WHERE tenant_id = :tenantId 
  AND created_by = :userId;  -- ❌ NEVER DO THIS

-- WRONG: This breaks task collaboration
SELECT * FROM tasks 
WHERE tenant_id = :tenantId 
  AND assignee_id = :userId;  -- ❌ NEVER DO THIS for listing
```

---

## Restricted Data

The following resources have **additional access restrictions** beyond tenant scope:

| Resource | Visibility | Restriction Type |
|----------|------------|------------------|
| **Time Entries** | Owner only* | userId filter |
| **Personal Sections** | Owner only | userId filter |
| **Active Timers** | Owner only | userId filter (unique index) |
| **User Profile** | Own profile | userId match |
| **Tenant Settings** | Admin only | Role check |
| **Integrations** | Admin only | Role check |
| **Agreements** | Admin manage, all accept | Role + userId |

*Time entries may be visible to admins in reports, but standard queries are user-scoped.

### DO: Apply userId Filter for Restricted Data

```sql
-- CORRECT: Time entries are user-scoped
SELECT * FROM time_entries 
WHERE tenant_id = :tenantId 
  AND user_id = :userId;

-- CORRECT: Personal sections are user-scoped
SELECT * FROM personal_task_sections 
WHERE tenant_id = :tenantId 
  AND user_id = :userId;

-- CORRECT: Active timer is user-scoped (unique per user)
SELECT * FROM active_timers 
WHERE user_id = :userId;
```

### Admin Report Access

Admins may access aggregated or detailed time data for reporting:

```sql
-- CORRECT: Admin can see all tenant time entries in reports
SELECT * FROM time_entries 
WHERE tenant_id = :tenantId;
-- But only when: req.user.role === 'admin' || req.user.role === 'super_user'
```

---

## Backend Enforcement Rules

### Query Pattern: Shared Resources

```typescript
// Storage layer for shared resources
async getClients(tenantId: string): Promise<Client[]> {
  return db.query.clients.findMany({
    where: eq(clients.tenantId, tenantId),
    // NO userId filter - all tenant users see all clients
  });
}

async getProjects(tenantId: string): Promise<Project[]> {
  return db.query.projects.findMany({
    where: eq(projects.tenantId, tenantId),
    // NO userId filter - all tenant users see all projects
  });
}
```

### Query Pattern: User-Scoped Resources

```typescript
// Storage layer for user-scoped resources
async getTimeEntries(tenantId: string, userId: string): Promise<TimeEntry[]> {
  return db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.tenantId, tenantId),
      eq(timeEntries.userId, userId)  // USER-SCOPED
    ),
  });
}

async getActiveTimer(userId: string): Promise<ActiveTimer | null> {
  return db.query.activeTimers.findFirst({
    where: eq(activeTimers.userId, userId),  // USER-SCOPED
  });
}
```

### Route Pattern: Role-Gated Admin Features

```typescript
// Admin-only endpoints
app.get('/api/v1/tenant/settings', 
  requireAuth,
  requireTenantAdmin,  // Role check
  async (req, res) => {
    const settings = await storage.getTenantSettings(req.tenant.effectiveTenantId!);
    res.json(settings);
  }
);
```

---

## UI Gating Rules

**Important:** UI visibility is for **user experience**, not security. All security enforcement happens on the backend.

### UI Visibility Patterns

| Element | Visibility Rule | Security Enforcement |
|---------|----------------|---------------------|
| "Settings" nav item | Admin role | Backend role check |
| "Edit Client" button | All users | Backend tenant check |
| "View Reports" tab | Admin role | Backend role + tenant |
| "My Time" entries | Current user | Backend userId filter |

### DO: Hide UI for Unauthorized Actions

```tsx
// CORRECT: UI hint for admin-only features
{user?.role === 'admin' && (
  <Link to="/settings">Settings</Link>
)}
```

### DO NOT: Rely on UI Hiding for Security

```tsx
// UI hiding is UX, not security
// The backend MUST still enforce access control
// Even if button is hidden, API must reject unauthorized requests
```

---

## Implementation Guidance

### Adding a New Shared Resource

1. Add `tenantId` column to schema
2. Query ONLY by `tenantId` in storage layer
3. DO NOT add `userId` or `createdBy` filters
4. Verify all tenant users can access

### Adding a New User-Scoped Resource

1. Add `tenantId` AND `userId` columns to schema
2. Query by BOTH `tenantId` AND `userId`
3. Document the scoping in this policy
4. Consider admin override for reports

### Modifying Existing Queries

1. Check this document for resource type
2. Verify query matches expected visibility
3. Test with multiple users in same tenant
4. Test with users in different tenants

---

## Common Pitfalls to Avoid

### Pitfall 1: Filtering Shared Data by Creator

```sql
-- ❌ WRONG: Clients should be visible to all tenant users
SELECT * FROM clients WHERE created_by = :userId;

-- ✅ CORRECT: Filter by tenant only
SELECT * FROM clients WHERE tenant_id = :tenantId;
```

### Pitfall 2: Filtering Tasks by Assignee in List Views

```sql
-- ❌ WRONG: All tasks should be visible for collaboration
SELECT * FROM tasks WHERE assignee_id = :userId;

-- ✅ CORRECT: For task list, show all tenant tasks
SELECT * FROM tasks WHERE tenant_id = :tenantId;

-- ✅ CORRECT: For "My Tasks" view, filter by assignment
SELECT * FROM tasks t
JOIN task_assignees ta ON t.id = ta.task_id
WHERE ta.user_id = :userId;
```

### Pitfall 3: Missing Tenant Filter on User-Scoped Data

```sql
-- ❌ WRONG: Missing tenant context (could leak cross-tenant)
SELECT * FROM time_entries WHERE user_id = :userId;

-- ✅ CORRECT: Always include tenant context
SELECT * FROM time_entries 
WHERE tenant_id = :tenantId AND user_id = :userId;
```

### Pitfall 4: Exposing Tenant Settings to Non-Admins

```typescript
// ❌ WRONG: No role check
app.get('/api/tenant/settings', requireAuth, handler);

// ✅ CORRECT: Admin role required
app.get('/api/tenant/settings', requireAuth, requireTenantAdmin, handler);
```

### Pitfall 5: Assuming UI Hiding is Security

```typescript
// ❌ WRONG: Only hiding UI
if (isAdmin) {
  showDeleteButton();
}
// Backend has no protection!

// ✅ CORRECT: UI hint + backend enforcement
// Frontend:
if (isAdmin) {
  showDeleteButton();
}
// Backend:
app.delete('/api/resource/:id', requireAuth, requireTenantAdmin, handler);
```

---

## Summary Table

| Resource | Filter By | Notes |
|----------|-----------|-------|
| Clients | `tenantId` | Shared across tenant |
| Projects | `tenantId` | Shared across tenant |
| Workspaces | `tenantId` | Shared across tenant |
| Tasks | `tenantId` | Shared across tenant |
| Teams | `tenantId` | Shared across tenant |
| Time Entries | `tenantId` + `userId` | User's own entries |
| Active Timers | `userId` | One per user (unique) |
| Personal Sections | `tenantId` + `userId` | User's organization |
| Tenant Settings | `tenantId` + admin role | Admin access only |
| Integrations | `tenantId` + admin role | Admin access only |

---

## Related Sections

- [Tenant Isolation](./TENANT_ISOLATION.md) - Technical enforcement details
- [Authorization](./AUTHORIZATION.md) - Role-based access control
- [Backend Middleware](../06-BACKEND/MIDDLEWARE.md) - Middleware implementation
