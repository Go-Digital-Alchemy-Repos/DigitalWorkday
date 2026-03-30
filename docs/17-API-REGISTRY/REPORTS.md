# reports API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | reports |
| **Route File(s)** | `server/routes/modules/super-admin/reports.router.ts` |
| **Base Path(s)** | /api/v1/reports |

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

### SQL-First Report Summary Aggregation (March 2026)

The `GET /api/time-entries/report/summary` endpoint was refactored to use SQL-first aggregation instead of loading all entries into memory.

**What changed:**
- Total/inScope/outOfScope seconds computed via SQL `SUM` + `CASE WHEN` queries
- Entry count computed via SQL `COUNT(*)` instead of `entries.length`
- Grouped summaries (byClient, byProject, byUser) computed via SQL `GROUP BY` with `LEFT JOIN` for display names
- Tenancy null-check for soft-mode uses lightweight `EXISTS` query instead of scanning all entries

**What was preserved:**
- Exact response shape: `{ totalSeconds, inScopeSeconds, outOfScopeSeconds, entryCount, byClient, byProject, byUser }`
- `startDate`/`endDate` filter support
- Tenant/workspace scoping
- Soft-mode tenancy warning header logic

**New repository methods added to `TimeTrackingRepository`:**
- `getReportTotals()` — SUM aggregates with COUNT
- `getReportByClient()` — GROUP BY clientId with LEFT JOIN clients
- `getReportByProject()` — GROUP BY projectId with LEFT JOIN projects + clients
- `getReportByUser()` — GROUP BY userId with LEFT JOIN users
- `hasEntriesWithNullTenant()` — lightweight EXISTS check for soft-mode warnings

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-03-28T02:12:59.370Z

**Synced From:**
- `server/routes/modules/super-admin/reports.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/reports/tenants-summary` |
| GET | `/api/v1/reports/projects-summary` |
| GET | `/api/v1/reports/users-summary` |
| GET | `/api/v1/reports/tasks-summary` |
| GET | `/api/v1/reports/time-summary` |

<!-- === END AUTO-GENERATED SECTION === -->
