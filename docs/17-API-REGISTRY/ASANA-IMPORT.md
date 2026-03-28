# asana-import API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | asana-import |
| **Route File(s)** | `server/routes/modules/super-admin/asana-import.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.367Z

**Synced From:**
- `server/routes/modules/super-admin/asana-import.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/tenants/:tenantId/asana/connect` |
| POST | `/api/v1/tenants/:tenantId/asana/test` |
| GET | `/api/v1/tenants/:tenantId/asana/status` |
| POST | `/api/v1/tenants/:tenantId/asana/disconnect` |
| GET | `/api/v1/tenants/:tenantId/asana/workspaces` |
| GET | `/api/v1/tenants/:tenantId/asana/workspaces/:workspaceGid/projects` |
| POST | `/api/v1/tenants/:tenantId/asana/validate` |
| POST | `/api/v1/tenants/:tenantId/asana/execute` |
| GET | `/api/v1/tenants/:tenantId/asana/runs` |
| GET | `/api/v1/tenants/:tenantId/asana/runs/:runId` |
| GET | `/api/v1/tenants/:tenantId/asana/local-workspaces` |
| GET | `/api/v1/tenants/:tenantId/asana/local-clients` |

<!-- === END AUTO-GENERATED SECTION === -->
