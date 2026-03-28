# export-import API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | export-import |
| **Route File(s)** | `server/routes/modules/super-admin/export-import.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.369Z

**Synced From:**
- `server/routes/modules/super-admin/export-import.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenants/:tenantId/export/clients` |
| GET | `/api/v1/tenants/:tenantId/export/users` |
| GET | `/api/v1/tenants/:tenantId/export/time-entries` |
| POST | `/api/v1/tenants/:tenantId/import/clients` |
| POST | `/api/v1/tenants/:tenantId/import/time-entries` |
| POST | `/api/v1/tenants/:tenantId/import/user-client-summary` |
| POST | `/api/v1/tenants/:tenantId/import/jobs` |
| POST | `/api/v1/tenants/:tenantId/import/jobs/:jobId/upload` |
| PUT | `/api/v1/tenants/:tenantId/import/jobs/:jobId/mapping` |
| POST | `/api/v1/tenants/:tenantId/import/jobs/:jobId/validate` |
| POST | `/api/v1/tenants/:tenantId/import/jobs/:jobId/run` |
| GET | `/api/v1/tenants/:tenantId/import/jobs/:jobId` |
| GET | `/api/v1/tenants/:tenantId/import/jobs` |
| GET | `/api/v1/tenants/:tenantId/import/jobs/:jobId/errors.csv` |
| GET | `/api/v1/tenants/:tenantId/import/fields/:entityType` |

<!-- === END AUTO-GENERATED SECTION === -->
