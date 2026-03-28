# tenant-users API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant-users |
| **Route File(s)** | `server/routes/modules/super-admin/tenant-users.router.ts` |
| **Base Path(s)** | /api/v1/tenants |

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

**Last Synced:** 2026-03-28T02:12:59.374Z

**Synced From:**
- `server/routes/modules/super-admin/tenant-users.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenants/:tenantId/users` |
| POST | `/api/v1/tenants/:tenantId/users` |
| POST | `/api/v1/tenants/:tenantId/users/provision` |
| POST | `/api/v1/tenants/:tenantId/users/fix-tenant-ids` |
| PATCH | `/api/v1/tenants/:tenantId/users/:userId` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/activate` |
| DELETE | `/api/v1/tenants/:tenantId/users/:userId` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/set-password` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/impersonate-login` |
| GET | `/api/v1/tenants/:tenantId/users/:userId/invitation` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/regenerate-invite` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/send-invite` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/reset-password` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/generate-reset-link` |
| POST | `/api/v1/tenants/:tenantId/import-users` |
| GET | `/api/v1/tenants/:tenantId/users/:userId/workspaces` |
| POST | `/api/v1/tenants/:tenantId/users/:userId/assign-workspace` |
| DELETE | `/api/v1/tenants/:tenantId/users/:userId/workspaces/:workspaceId` |

<!-- === END AUTO-GENERATED SECTION === -->
