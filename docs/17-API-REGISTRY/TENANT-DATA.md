# tenant Data API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant Data |
| **Route File(s)** | `server/routes/tenantData.ts` |
| **Base Path(s)** | /api/v1/export, /api/v1/import, /api/v1/asana |

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

**Last Synced:** 2026-03-28T02:12:59.380Z

**Synced From:**
- `server/routes/tenantData.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/export/clients` |
| GET | `/api/v1/export/users` |
| GET | `/api/v1/export/time-entries` |
| POST | `/api/v1/import/clients` |
| POST | `/api/v1/import/time-entries` |
| POST | `/api/v1/import/jobs` |
| POST | `/api/v1/import/jobs/:jobId/upload` |
| PUT | `/api/v1/import/jobs/:jobId/mapping` |
| POST | `/api/v1/import/jobs/:jobId/validate` |
| POST | `/api/v1/import/jobs/:jobId/run` |
| GET | `/api/v1/import/jobs/:jobId` |
| GET | `/api/v1/import/jobs` |
| GET | `/api/v1/import/jobs/:jobId/errors.csv` |
| GET | `/api/v1/import/fields/:entityType` |
| POST | `/api/v1/asana/connect` |
| POST | `/api/v1/asana/test` |
| GET | `/api/v1/asana/status` |
| POST | `/api/v1/asana/disconnect` |
| GET | `/api/v1/asana/workspaces` |
| GET | `/api/v1/asana/workspaces/:workspaceGid/projects` |
| POST | `/api/v1/asana/validate` |
| POST | `/api/v1/asana/execute` |
| GET | `/api/v1/asana/runs` |
| GET | `/api/v1/asana/runs/:runId` |
| GET | `/api/v1/asana/local-workspaces` |
| GET | `/api/v1/asana/local-clients` |

<!-- === END AUTO-GENERATED SECTION === -->
