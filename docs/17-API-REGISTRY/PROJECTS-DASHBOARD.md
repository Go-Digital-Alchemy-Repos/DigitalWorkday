# Projects Dashboard API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Projects Dashboard |
| **Route File(s)** | `server/routes/projectsDashboard.ts` |
| **Base Path(s)** | /api/v1/projects |

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

**Last Synced:** 2026-02-05T00:11:27.562Z

**Synced From:**
- `server/routes/projectsDashboard.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/projects` |
| GET | `/api/v1/projects/analytics/summary` |
| GET | `/api/v1/projects/:projectId/analytics` |
| GET | `/api/v1/projects/:projectId/forecast` |
| GET | `/api/v1/projects/forecast/summary` |

<!-- === END AUTO-GENERATED SECTION === -->
