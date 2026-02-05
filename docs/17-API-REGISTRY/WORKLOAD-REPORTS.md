# Workload Reports API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Workload Reports |
| **Route File(s)** | `server/routes/workloadReports.ts` |
| **Base Path(s)** | /api/v1/workload |

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

**Last Synced:** 2026-02-05T02:15:12.285Z

**Synced From:**
- `server/routes/workloadReports.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/workload/tasks-by-employee` |
| GET | `/api/v1/workload/employee/:userId/tasks` |
| GET | `/api/v1/workload/unassigned` |
| GET | `/api/v1/workload/by-status` |
| GET | `/api/v1/workload/by-priority` |
| GET | `/api/v1/workload/summary` |

<!-- === END AUTO-GENERATED SECTION === -->
