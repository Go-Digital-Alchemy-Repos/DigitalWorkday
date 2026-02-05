# God Routes Refactoring Plan

## Overview
This document outlines the plan to break up oversized "god route files" into smaller, domain-based router modules. This is a NON-DESTRUCTIVE refactor - no endpoint URLs, HTTP methods, request/response shapes, auth behavior, or middleware order will change.

## Identified God Route Files (>= 800 lines)

| File | Lines | Priority | Base Path(s) |
|------|-------|----------|--------------|
| `server/routes/superAdmin.ts` | 9,453 | 1 (Highest) | `/api/v1/super/*` |
| `server/routes.ts` | 6,096 | 2 | `/api/*` |
| `server/routes/chat.ts` | 1,337 | 3 | `/api/chat/*` |
| `server/routes/superDebug.ts` | 1,337 | 4 | `/api/v1/super/debug/*` |
| `server/routes/tenancyHealth.ts` | 1,211 | 5 | `/api/v1/super/tenancy/*` |
| `server/routes/tenantOnboarding.ts` | 1,173 | 6 | `/api/v1/onboarding/*` |
| `server/routes/systemStatus.ts` | 792 | 7 (Near threshold) | `/api/v1/super/status/*` |

---

## Proposed Domain Splits

### 1. `server/routes.ts` (6,096 lines) → Split into:

| Domain | Estimated Lines | New Router File | Endpoints |
|--------|----------------|-----------------|-----------|
| **Search** | ~80 | `modules/search/search.router.ts` | `GET /api/search` |
| **Workspaces** | ~200 | `modules/workspaces/workspaces.router.ts` | `/api/workspaces/*`, `/api/workspace-members` |
| **Projects** | ~500 | `modules/projects/projects.router.ts` | `/api/projects/*` (CRUD, members, hide) |
| **Teams** | ~200 | `modules/teams/teams.router.ts` | `/api/teams/*` |
| **Sections** | ~100 | `modules/sections/sections.router.ts` | `/api/sections/*`, `/api/projects/:id/sections` |
| **Tasks** | ~800 | `modules/tasks/tasks.router.ts` | `/api/tasks/*`, `/api/projects/:id/tasks` |
| **Subtasks** | ~250 | `modules/subtasks/subtasks.router.ts` | `/api/subtasks/*`, `/api/tasks/:id/subtasks` |
| **Tags** | ~100 | `modules/tags/tags.router.ts` | `/api/tags/*`, `/api/tasks/:id/tags`, `/api/workspaces/:id/tags` |
| **Comments** | ~200 | `modules/comments/comments.router.ts` | `/api/comments/*`, `/api/tasks/:id/comments` |
| **Activity** | ~100 | `modules/activity/activity.router.ts` | `/api/activity-log/*` |
| **Attachments** | ~200 | `modules/attachments/attachments.router.ts` | `/api/attachments/*` |
| **Clients** | ~400 | `modules/clients/clients.router.ts` | `/api/clients/*` (CRUD, contacts, invites, notes) |
| **Divisions** | ~100 | `modules/divisions/divisions.router.ts` | `/api/v1/divisions/*`, `/api/v1/clients/:id/divisions` |
| **Timer** | ~500 | `modules/timer/timer.router.ts` | `/api/timer/*` |
| **Time Entries** | ~500 | `modules/time-entries/time-entries.router.ts` | `/api/time-entries/*`, `/api/calendar/events` |
| **Users (Tenant)** | ~400 | `modules/users/users.router.ts` | `/api/users/*`, `/api/tenant/users`, `/api/invitations/*` |
| **Settings** | ~100 | `modules/settings/settings.router.ts` | `/api/settings/*` |
| **My Tasks** | ~150 | `modules/my-tasks/my-tasks.router.ts` | `/api/v1/my-tasks/*` |
| **Me (Profile)** | ~150 | `modules/me/me.router.ts` | `/api/v1/me/*` |

### 2. `server/routes/superAdmin.ts` (9,453 lines) → Split into:

| Domain | Estimated Lines | New Router File | Endpoints |
|--------|----------------|-----------------|-----------|
| **Bootstrap** | ~120 | `modules/super-admin/bootstrap.router.ts` | `POST /bootstrap` |
| **Tenants CRUD** | ~600 | `modules/super-admin/tenants.router.ts` | `/tenants` CRUD, activate, suspend, deactivate |
| **Tenant Workspaces** | ~150 | `modules/super-admin/tenant-workspaces.router.ts` | `/tenants/:id/workspaces/*` |
| **Tenant Users** | ~800 | `modules/super-admin/tenant-users.router.ts` | `/tenants/:id/users/*`, invites, impersonation |
| **Tenant Invitations** | ~400 | `modules/super-admin/tenant-invitations.router.ts` | `/tenants/:id/invitations/*` |
| **Global Users** | ~500 | `modules/super-admin/users.router.ts` | `/users/*` (orphaned, all users) |
| **Global Invitations** | ~150 | `modules/super-admin/invitations.router.ts` | `/invitations/*` |
| **Impersonation** | ~200 | `modules/super-admin/impersonation.router.ts` | `/impersonate/*`, `/impersonation/*` |
| **Tenant Settings** | ~200 | `modules/super-admin/tenant-settings.router.ts` | `/tenants/:id/settings/*` |
| **Tenant Integrations** | ~200 | `modules/super-admin/tenant-integrations.router.ts` | `/tenants/:id/integrations/*` |
| **Tenant Notes** | ~250 | `modules/super-admin/tenant-notes.router.ts` | `/tenants/:id/notes/*` |
| **Tenant Audit** | ~100 | `modules/super-admin/tenant-audit.router.ts` | `/tenants/:id/audit` |
| **Tenant Health** | ~200 | `modules/super-admin/tenant-health.router.ts` | `/tenants/:id/health` |
| **Tenant Clients** | ~400 | `modules/super-admin/tenant-clients.router.ts` | `/tenants/:id/clients/*` |
| **Tenant Projects** | ~300 | `modules/super-admin/tenant-projects.router.ts` | `/tenants/:id/projects/*` |
| **Bulk Operations** | ~500 | `modules/super-admin/bulk-operations.router.ts` | `/tenants/:id/*/bulk` |
| **Seeding** | ~400 | `modules/super-admin/seeding.router.ts` | `/tenants/:id/seed/*` |
| **System Settings** | ~100 | `modules/super-admin/system-settings.router.ts` | `/system-settings` |
| **System Purge** | ~250 | `modules/super-admin/system-purge.router.ts` | `/system/purge-app-data` |
| **Admins** | ~500 | `modules/super-admin/admins.router.ts` | `/admins/*` |
| **Agreements** | ~500 | `modules/super-admin/agreements.router.ts` | `/agreements/*` |
| **Reports** | ~300 | `modules/super-admin/reports.router.ts` | `/reports/*` |
| **Tenancy Health** | ~200 | `modules/super-admin/tenancy-health.router.ts` | `/tenancy/*`, `/system/health/tenancy/*` |
| **Tenant Picker** | ~50 | `modules/super-admin/tenant-picker.router.ts` | `/tenants/picker` |
| **Docs** | ~200 | `modules/super-admin/docs.router.ts` | `/docs/*` |
| **Export/Import** | ~400 | `modules/super-admin/export-import.router.ts` | `/tenants/:id/export/*`, `/tenants/:id/import/*` |
| **AI Config** | ~150 | `modules/super-admin/ai-config.router.ts` | `/ai/*` |
| **System Diagnostics** | ~150 | `modules/super-admin/diagnostics.router.ts` | `/system/db-introspect`, `/diagnostics/*` |

### 3. Other Files (Lower Priority)

| File | Action |
|------|--------|
| `server/routes/chat.ts` (1,337 lines) | Keep as-is for now; well-scoped to chat domain |
| `server/routes/superDebug.ts` (1,337 lines) | Keep as-is; debug-only routes |
| `server/routes/tenancyHealth.ts` (1,211 lines) | Keep as-is; specialized health checks |
| `server/routes/tenantOnboarding.ts` (1,173 lines) | Keep as-is; onboarding flow specific |
| `server/routes/systemStatus.ts` (792 lines) | Near threshold, monitor only |

---

## Extraction Order

### Phase 1: `routes.ts` (Tenant API)
Extract in this order (dependencies considered):

1. **Search** - Standalone, no dependencies
2. **Tags** - Used by tasks/subtasks
3. **Comments** - Used by tasks
4. **Activity** - Logging, standalone
5. **Attachments** - Standalone
6. **Sections** - Used by projects/tasks
7. **Subtasks** - Depends on tasks
8. **Tasks** - Core domain, large
9. **Projects** - Core domain, large
10. **Teams** - Organization
11. **Workspaces** - Top-level organization
12. **Clients** - Large domain
13. **Divisions** - Client sub-domain
14. **Timer** - Time tracking
15. **Time Entries** - Time tracking
16. **Users** - Tenant user management
17. **Settings** - Configuration
18. **My Tasks** - Personal sections
19. **Me** - Profile endpoints

### Phase 2: `superAdmin.ts` (Super Admin API)
Extract in this order:

1. **Bootstrap** - Standalone, first endpoint
2. **System Settings** - Small, standalone
3. **AI Config** - Small, standalone
4. **Diagnostics** - Small, standalone
5. **Docs** - Documentation
6. **Reports** - Reporting
7. **Agreements** - Standalone
8. **Admins** - Admin management
9. **Impersonation** - Auth feature
10. **Global Users** - User queries
11. **Global Invitations** - Invitation management
12. **Tenants CRUD** - Core tenant ops
13. **Tenant Workspaces** - Sub-resource
14. **Tenant Users** - Large domain
15. **Tenant Invitations** - Sub-resource
16. **Tenant Settings** - Configuration
17. **Tenant Integrations** - Integration config
18. **Tenant Notes** - Notes feature
19. **Tenant Audit** - Audit logs
20. **Tenant Health** - Health checks
21. **Tenant Clients** - Client management
22. **Tenant Projects** - Project management
23. **Bulk Operations** - Batch operations
24. **Seeding** - Demo data
25. **System Purge** - Data cleanup
26. **Tenancy Health** - Global tenancy
27. **Tenant Picker** - UI helper
28. **Export/Import** - Data transfer

---

## File Structure After Refactor

```
server/
├── routes.ts                    # ~200 lines - mounts all routers
├── routes/
│   ├── modules/
│   │   ├── index.ts             # Barrel export
│   │   ├── search/
│   │   │   └── search.router.ts
│   │   ├── workspaces/
│   │   │   └── workspaces.router.ts
│   │   ├── projects/
│   │   │   └── projects.router.ts
│   │   ├── teams/
│   │   │   └── teams.router.ts
│   │   ├── sections/
│   │   │   └── sections.router.ts
│   │   ├── tasks/
│   │   │   └── tasks.router.ts
│   │   ├── subtasks/
│   │   │   └── subtasks.router.ts
│   │   ├── tags/
│   │   │   └── tags.router.ts
│   │   ├── comments/
│   │   │   └── comments.router.ts
│   │   ├── activity/
│   │   │   └── activity.router.ts
│   │   ├── attachments/
│   │   │   └── attachments.router.ts
│   │   ├── clients/
│   │   │   └── clients.router.ts
│   │   ├── divisions/
│   │   │   └── divisions.router.ts
│   │   ├── timer/
│   │   │   └── timer.router.ts
│   │   ├── time-entries/
│   │   │   └── time-entries.router.ts
│   │   ├── users/
│   │   │   └── users.router.ts
│   │   ├── settings/
│   │   │   └── settings.router.ts
│   │   ├── my-tasks/
│   │   │   └── my-tasks.router.ts
│   │   ├── me/
│   │   │   └── me.router.ts
│   │   └── super-admin/
│   │       ├── index.ts
│   │       ├── bootstrap.router.ts
│   │       ├── tenants.router.ts
│   │       ├── tenant-workspaces.router.ts
│   │       ├── tenant-users.router.ts
│   │       ├── tenant-invitations.router.ts
│   │       ├── users.router.ts
│   │       ├── invitations.router.ts
│   │       ├── impersonation.router.ts
│   │       ├── tenant-settings.router.ts
│   │       ├── tenant-integrations.router.ts
│   │       ├── tenant-notes.router.ts
│   │       ├── tenant-audit.router.ts
│   │       ├── tenant-health.router.ts
│   │       ├── tenant-clients.router.ts
│   │       ├── tenant-projects.router.ts
│   │       ├── bulk-operations.router.ts
│   │       ├── seeding.router.ts
│   │       ├── system-settings.router.ts
│   │       ├── system-purge.router.ts
│   │       ├── admins.router.ts
│   │       ├── agreements.router.ts
│   │       ├── reports.router.ts
│   │       ├── tenancy-health.router.ts
│   │       ├── tenant-picker.router.ts
│   │       ├── docs.router.ts
│   │       ├── export-import.router.ts
│   │       ├── ai-config.router.ts
│   │       └── diagnostics.router.ts
│   ├── superAdmin.ts            # ~100 lines - mounts super-admin routers
│   ├── chat.ts                  # Keep as-is
│   ├── superDebug.ts            # Keep as-is
│   ├── tenancyHealth.ts         # Keep as-is
│   ├── tenantOnboarding.ts      # Keep as-is
│   └── systemStatus.ts          # Keep as-is
```

---

## Success Criteria

1. All god route files reduced to <300 lines (mounting + shared helpers only)
2. Each domain router is <500 lines
3. Route registry parity matches exactly (before vs after)
4. All tests pass
5. No API behavior changes
6. Documentation updated

---

## Notes

- Shared middleware (`requireAuth`, `requireAdmin`, `requireSuperUser`) stays in original location
- Storage/service imports stay with handlers
- Helper functions move with their handlers when tightly coupled
- Type definitions stay in `@shared/schema.ts`
