# Time Tracking API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Time Tracking |
| **Route File(s)** | `server/routes/timeTracking.ts` |
| **Base Path(s)** | /api/timer/current, /api/timer/start, /api/timer/pause, /api/timer/resume, /api/timer/stop |

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

### SQL-First Aggregate Strategy (March 2026)

The `GET /api/time-entries/my/stats` endpoint was refactored to use SQL-first aggregation instead of loading all entries into memory.

**What changed:**
- Period-bucketed totals (today/week/month/allTime) with billable/unbillable splits are now computed via SQL `SUM` + `CASE WHEN` + `GROUP BY` queries
- Daily breakdown for the current week uses SQL `GROUP BY to_char(start_time, 'YYYY-MM-DD')`
- Day totals for the current month (used for long-running-day warnings) computed server-side in SQL
- Missing description entries retrieved via targeted SQL query with `LIMIT 10` and `ORDER BY` instead of scanning all entries
- Last entry ID retrieved via `ORDER BY start_time DESC LIMIT 1` instead of sorting all entries in memory

**What was preserved:**
- Exact response shape: `{ today, thisWeek, thisMonth, allTime, dailyBreakdown, warnings: { missingDescriptions, longRunningDays }, lastEntryId }`
- Tenant isolation via `getEffectiveTenantId` + strict-mode branching
- Billable = `scope === 'out_of_scope'` mapping

**New repository methods added to `TimeTrackingRepository`:**
- `getAggregatedPeriodTotals()` — period-bucketed SUM aggregates
- `getAllTimeTotals()` — all-time SUM aggregates
- `getDailyBreakdown()` — date-grouped daily breakdown
- `getDayTotalsForMonth()` — date-grouped totals for month
- `getMissingDescriptionEntries()` — targeted query with LIMIT
- `getLastEntryId()` — ORDER BY + LIMIT 1

**New indexes:**
- `time_entries_workspace_start_idx` on `(workspace_id, start_time)`
- `time_entries_tenant_workspace_start_idx` on `(tenant_id, workspace_id, start_time)`

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-02-05T02:15:12.283Z

**Synced From:**
- `server/routes/timeTracking.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/timer/current` |
| POST | `/api/timer/start` |
| POST | `/api/timer/pause` |
| POST | `/api/timer/resume` |
| POST | `/api/timer/stop` |
| PATCH | `/api/timer/current` |
| DELETE | `/api/timer/current` |

<!-- === END AUTO-GENERATED SECTION === -->
