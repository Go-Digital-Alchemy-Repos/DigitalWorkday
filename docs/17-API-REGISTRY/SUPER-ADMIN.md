# Super Admin API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Super Admin |
| **Route File(s)** | `server/routes/superAdmin.ts` |
| **Base Path(s)** | /api/v1/super |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | TBD |
| **Tenant Scoped** | TBD |

---

<!-- === MANUAL NOTES SECTION (safe to edit) === -->

## Notes / Gotchas

*Add manual notes here. This section will be preserved during sync.*

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-02-05T00:11:27.563Z

**Synced From:**
- `server/routes/superAdmin.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/super/bootstrap` |
| GET | `/api/v1/super/tenants` |
| GET | `/api/v1/super/tenants/:id` |
| POST | `/api/v1/super/tenants` |
| PATCH | `/api/v1/super/tenants/:id` |
| POST | `/api/v1/super/tenants/:tenantId/activate` |
| POST | `/api/v1/super/tenants/:tenantId/suspend` |
| POST | `/api/v1/super/tenants/:tenantId/deactivate` |
| DELETE | `/api/v1/super/tenants/:tenantId` |
| GET | `/api/v1/super/tenants/:tenantId/workspaces` |
| POST | `/api/v1/super/tenants/:tenantId/workspaces` |
| PATCH | `/api/v1/super/tenants/:tenantId/workspaces/:workspaceId` |
| DELETE | `/api/v1/super/tenants/:tenantId/workspaces/:workspaceId` |
| POST | `/api/v1/super/tenants/:tenantId/invite-admin` |
| GET | `/api/v1/super/tenants/:tenantId/users` |
| GET | `/api/v1/super/tenants/:tenantId/invitations` |
| POST | `/api/v1/super/tenants/:tenantId/invitations/:invitationId/activate` |
| POST | `/api/v1/super/tenants/:tenantId/invitations/activate-all` |
| POST | `/api/v1/super/tenants/:tenantId/users` |
| POST | `/api/v1/super/tenants/:tenantId/users/provision` |
| POST | `/api/v1/super/tenants/:tenantId/users/fix-tenant-ids` |
| GET | `/api/v1/super/users/orphaned` |
| GET | `/api/v1/super/users` |
| GET | `/api/v1/super/users/:userId/activity` |
| PATCH | `/api/v1/super/users/:userId` |
| POST | `/api/v1/super/users/:userId/set-password` |
| POST | `/api/v1/super/users/:userId/generate-reset-link` |
| DELETE | `/api/v1/super/users/:userId` |
| POST | `/api/v1/super/invitations/:invitationId/resend` |
| DELETE | `/api/v1/super/invitations/:invitationId` |
| POST | `/api/v1/super/invitations/:invitationId/activate` |
| PATCH | `/api/v1/super/tenants/:tenantId/users/:userId` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/activate` |
| DELETE | `/api/v1/super/tenants/:tenantId/users/:userId` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/set-password` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/impersonate-login` |
| POST | `/api/v1/super/impersonation/exit` |
| GET | `/api/v1/super/impersonation/status` |
| GET | `/api/v1/super/tenants/:tenantId/users/:userId/invitation` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/regenerate-invite` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/send-invite` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/reset-password` |
| POST | `/api/v1/super/tenants/:tenantId/users/:userId/generate-reset-link` |
| POST | `/api/v1/super/tenants/:tenantId/invitations/:invitationId/revoke` |
| POST | `/api/v1/super/tenants/:tenantId/invitations/:invitationId/resend` |
| POST | `/api/v1/super/tenants/:tenantId/invitations/:invitationId/regenerate` |
| DELETE | `/api/v1/super/tenants/:tenantId/invitations/:invitationId` |
| POST | `/api/v1/super/tenants/:tenantId/import-users` |
| GET | `/api/v1/super/tenants/:tenantId/onboarding-status` |
| GET | `/api/v1/super/tenants-detail` |
| GET | `/api/v1/super/tenants/:tenantId/settings` |
| PATCH | `/api/v1/super/tenants/:tenantId/settings` |
| GET | `/api/v1/super/tenants/:tenantId/integrations` |
| GET | `/api/v1/super/tenants/:tenantId/integrations/:provider` |
| PUT | `/api/v1/super/tenants/:tenantId/integrations/:provider` |
| POST | `/api/v1/super/tenants/:tenantId/integrations/:provider/test` |
| POST | `/api/v1/super/tenants/:tenantId/settings/brand-assets` |
| GET | `/api/v1/super/tenants/:tenantId/notes` |
| POST | `/api/v1/super/tenants/:tenantId/notes` |
| PATCH | `/api/v1/super/tenants/:tenantId/notes/:noteId` |
| GET | `/api/v1/super/tenants/:tenantId/notes/:noteId/versions` |
| DELETE | `/api/v1/super/tenants/:tenantId/notes/:noteId` |
| GET | `/api/v1/super/tenants/:tenantId/audit` |
| GET | `/api/v1/super/tenants/:tenantId/health` |
| POST | `/api/v1/super/tenants/:tenantId/clients/bulk` |
| POST | `/api/v1/super/tenants/:tenantId/projects/bulk` |
| GET | `/api/v1/super/tenants/:tenantId/clients` |
| POST | `/api/v1/super/tenants/:tenantId/clients` |
| POST | `/api/v1/super/tenants/:tenantId/clients/fix-tenant-ids` |
| PATCH | `/api/v1/super/tenants/:tenantId/clients/:clientId` |
| DELETE | `/api/v1/super/tenants/:tenantId/clients/:clientId` |
| GET | `/api/v1/super/tenants/:tenantId/projects` |
| POST | `/api/v1/super/tenants/:tenantId/projects` |
| PATCH | `/api/v1/super/tenants/:tenantId/projects/:projectId` |
| DELETE | `/api/v1/super/tenants/:tenantId/projects/:projectId` |
| POST | `/api/v1/super/system/purge-app-data` |
| POST | `/api/v1/super/tenants/:tenantId/seed/welcome-project` |
| POST | `/api/v1/super/tenants/:tenantId/projects/:projectId/seed/task-template` |
| POST | `/api/v1/super/tenants/:tenantId/projects/:projectId/tasks/bulk` |
| GET | `/api/v1/super/system-settings` |
| PATCH | `/api/v1/super/system-settings` |
| GET | `/api/v1/super/admins` |
| GET | `/api/v1/super/admins/:id` |
| POST | `/api/v1/super/admins` |
| PATCH | `/api/v1/super/admins/:id` |
| DELETE | `/api/v1/super/admins/:id` |
| POST | `/api/v1/super/admins/:id/invite` |
| GET | `/api/v1/super/admins/:id/audit-events` |
| POST | `/api/v1/super/admins/:id/provision` |
| GET | `/api/v1/super/agreements/tenants-summary` |
| GET | `/api/v1/super/agreements` |
| GET | `/api/v1/super/agreements/:id` |
| POST | `/api/v1/super/agreements` |
| PATCH | `/api/v1/super/agreements/:id` |
| POST | `/api/v1/super/agreements/:id/publish` |
| POST | `/api/v1/super/agreements/:id/archive` |
| DELETE | `/api/v1/super/agreements/:id` |
| GET | `/api/v1/super/agreements/:id/signers` |
| GET | `/api/v1/super/reports/tenants-summary` |
| GET | `/api/v1/super/reports/projects-summary` |
| GET | `/api/v1/super/reports/users-summary` |
| GET | `/api/v1/super/reports/tasks-summary` |
| GET | `/api/v1/super/reports/time-summary` |
| GET | `/api/v1/super/tenancy/health` |
| GET | `/api/v1/super/system/health/tenancy` |
| POST | `/api/v1/super/system/health/tenancy/repair-preview` |
| POST | `/api/v1/super/system/health/tenancy/repair-apply` |
| POST | `/api/v1/super/tenancy/backfill` |
| GET | `/api/v1/super/tenants/picker` |
| POST | `/api/v1/super/impersonate/start` |
| POST | `/api/v1/super/impersonate/stop` |
| GET | `/api/v1/super/docs` |
| GET | `/api/v1/super/docs/:docPath` |
| POST | `/api/v1/super/docs/sync` |
| GET | `/api/v1/super/tenants/:tenantId/export/clients` |
| GET | `/api/v1/super/tenants/:tenantId/export/users` |
| GET | `/api/v1/super/tenants/:tenantId/export/time-entries` |
| POST | `/api/v1/super/tenants/:tenantId/import/clients` |
| POST | `/api/v1/super/tenants/:tenantId/import/time-entries` |
| GET | `/api/v1/super/ai/config` |
| PUT | `/api/v1/super/ai/config` |
| POST | `/api/v1/super/ai/test` |
| DELETE | `/api/v1/super/ai/api-key` |
| GET | `/api/v1/super/system/db-introspect` |
| GET | `/api/v1/super/diagnostics/schema` |

<!-- === END AUTO-GENERATED SECTION === -->
