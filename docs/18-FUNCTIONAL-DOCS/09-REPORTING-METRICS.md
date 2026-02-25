# Reporting Metric Definitions & Governance

This document is the single source of truth for all metric formulas, date field conventions, null-handling rules, and timezone logic used in the MyWorkDay Reporting Engine V2.

---

## Metric Registry

All metrics are defined in `server/reports/metricDefinitions.ts` and grouped by type.

### Metric Types

| Type | Meaning |
|---|---|
| `range_based` | Computed over a user-supplied date window (startDate → endDate) |
| `current_state` | Snapshot of current data, independent of date range |
| `derived` | Computed from one or more other metrics using arithmetic |

---

## Task Metrics

| Metric | Type | Calculation | Date Field |
|---|---|---|---|
| `assignedCount` | range_based | COUNT tasks WHERE assignee_id = userId AND created_at BETWEEN startDate AND endDate | tasks.created_at |
| `completedCount` | range_based | COUNT tasks WHERE status = 'done' AND updated_at BETWEEN startDate AND endDate | tasks.updated_at |
| `activeTasks` | current_state | COUNT tasks WHERE status NOT IN ('done', 'cancelled') | — |
| `overdueTasks` | current_state | COUNT tasks WHERE status NOT IN ('done','cancelled') AND due_date < NOW() | tasks.due_date |
| `dueSoonCount` | current_state | COUNT tasks with due_date BETWEEN NOW() AND NOW()+7days | tasks.due_date |
| `backlogCount` | current_state | COUNT active tasks where updated_at < NOW() - 14 days | tasks.updated_at |
| `avgCompletionDays` | range_based | AVG(EXTRACT(days FROM updated_at - created_at)) WHERE status='done' in range | tasks.updated_at |

---

## Time Entry Metrics

| Metric | Type | Calculation | Date Field |
|---|---|---|---|
| `totalHours` | range_based | SUM(duration_seconds / 3600) WHERE start_time BETWEEN startDate AND endDate | time_entries.start_time |
| `billableHours` | range_based | SUM(duration_seconds / 3600) WHERE start_time in range AND is_billable = true | time_entries.start_time |
| `nonBillableHours` | derived | totalHours − billableHours | — |
| `estimatedHours` | current_state | SUM(COALESCE(estimate_minutes, 0)) / 60 for active tasks | — |
| `loggedDays` | range_based | COUNT(DISTINCT DATE(start_time)) in range | time_entries.start_time |

---

## Derived / Ratio Metrics

| Metric | Calculation | Division-by-Zero Rule |
|---|---|---|
| `utilizationPct` | ROUND((totalHours / (daysInRange × 8)) × 100) | Returns **null** if daysInRange = 0 |
| `efficiencyRatio` | ROUND((totalHours / estimatedHours) × 100) / 100 | Returns **null** if estimatedHours = 0 or null |
| `avgHoursPerDay` | totalHours / loggedDays | Returns **0** if loggedDays = 0 |
| `varianceHours` | totalHours − estimatedHours | Returns **0** if estimatedHours = 0 |
| `completionRate` | completedInRange / (completedInRange + activeTasks) × 100 | Returns **null** if denominator = 0 |

---

## Client Metrics

| Metric | Type | Calculation |
|---|---|---|
| `engagementScore` | derived | MIN(100, ROUND(LEAST(totalHours,40)/40×40 + LEAST(openTasks,20)/20×40 + LEAST(completedInRange,10)/10×20)) |
| `overdueTaskPct` | derived | overdueTasks / totalTasks × 100; null if totalTasks = 0 |
| `completedWithinDuePct` | derived | completedOnTime / totalDoneWithDue × 100; null if totalDoneWithDue = 0 |
| `inactivityDays` | current_state | EXTRACT(days FROM NOW() − GREATEST(MAX(tasks.updated_at), MAX(te.start_time), MAX(comments.created_at))) |

---

## Capacity / Risk Metrics

| Metric | Type | Calculation |
|---|---|---|
| `plannedHoursWeekly` | range_based | SUM(estimate_minutes / 60) for active tasks due within week; NULL estimate_minutes excluded |
| `actualHoursWeekly` | range_based | SUM(duration_seconds / 3600) WHERE start_time in week |
| `weeklyUtilizationPct` | derived | actualHoursWeekly / 40 × 100; always uses 40h denominator |

---

## Date Fields — Canonical Mapping

All V2 reporting endpoints must use these field assignments exclusively.

| Purpose | Field | Notes |
|---|---|---|
| Task completion | `tasks.updated_at` WHERE status = 'done' | No dedicated `completed_at` column exists in current schema |
| Task creation | `tasks.created_at` | |
| Due-date checks | `tasks.due_date` | Tasks with NULL due_date excluded from overdue/due-soon counts |
| Time entries | `time_entries.start_time` | |
| Comment activity | `comments.created_at` | |
| Last client activity | `GREATEST(tasks.updated_at, time_entries.start_time, comments.created_at)` | |

These mappings are also declared as constants in `server/reports/dateRangeResolver.ts → DateFields`.

---

## Null Handling Rules

| Rule | Behaviour |
|---|---|
| COUNT / SUM with no rows | Return **0** (via COALESCE) — never null |
| Ratio denominator = 0 | Return **null** (not 0, not Infinity) |
| `estimatedHours` = 0 or null | Exclude from efficiency calculation; `efficiencyRatio = null` |
| `availableHours` = 0 | `utilizationPct = null` |
| Tasks with null `due_date` | Excluded from overdue, due-soon, and SLA metrics |
| `inactivityDays` with no activity | Returns null |

---

## Ratio Handling Rules

- All ratios are computed in application code (TypeScript), not in SQL.
- Use `safeDivide(numerator, denominator)` from `server/reports/metricDefinitions.ts` for all divisions.
- Percentage values are stored as integers (0–100) or floats rounded to 1 decimal place.
- Utilization values above 200% trigger an overutilization risk flag but are **not capped** for display.
- Negative variance (`totalHours < estimatedHours`) is displayed as green (under budget); positive is red.

---

## Timezone Logic

Date range inputs:

- Caller supplies `?startDate=` and `?endDate=` as ISO-8601 strings (with or without timezone offset).
- Optional `?timezone=America/New_York` (IANA format).
- Validated and resolved by `resolveTimezone()` in `server/reports/dateRangeResolver.ts`.
- Invalid or absent timezone falls back to **UTC**.

Database storage:

- All timestamps stored in **UTC**.
- Timezone offset affects frontend display and weekly boundary alignment only.
- Weekly series generation (`buildWeeklySeries`) aligns to Monday of the start week in UTC.

---

## Range vs Current-State Definitions

**Range-based** metrics (type: `range_based`):
- Require `startDate` and `endDate` query params.
- Use the canonical date field for that metric type (see table above).
- Example: `totalHours` counts entries where `start_time BETWEEN startDate AND endDate`.

**Current-state** metrics (type: `current_state`):
- Represent a snapshot at query time, independent of the selected date range.
- Date range params are still parsed (for consistency) but not applied to these counts.
- Example: `activeTasks` counts all non-done, non-cancelled tasks right now.

**Derived** metrics (type: `derived`):
- Computed in TypeScript from other metrics — no direct SQL clause.
- Always check for zero denominators before computing.

---

## Validation Helper

`validateMetricConsistency(metricKey, dataset)` in `server/reports/metricDefinitions.ts`:

- In `NODE_ENV=development`: logs warnings to console for negative values, NaN, utilization > 200%.
- In production: no-op (returns result object silently).
- Does **not** throw — advisory only.

---

## Helper Functions Reference

| Function | Location | Purpose |
|---|---|---|
| `safeDivide(n, d)` | metricDefinitions.ts | Division returning null on zero denominator |
| `computeUtilizationPct(hours, days)` | metricDefinitions.ts | Utilization with null-safe available-hours check |
| `computeEfficiencyRatio(actual, estimated)` | metricDefinitions.ts | Efficiency with null-safe estimated-hours check |
| `computeCompletionRate(completed, active)` | metricDefinitions.ts | Completion rate with null-safe denominator |
| `resolveDateRange(query)` | dateRangeResolver.ts | Parse + validate + cap date range from request |
| `resolveTimezone(tz?)` | dateRangeResolver.ts | Validate IANA timezone, fall back to UTC |
| `computeDaysInRange(start, end)` | dateRangeResolver.ts | Days between two dates, minimum 1 |
| `computeAvailableHours(days)` | dateRangeResolver.ts | 8h × days, null if days ≤ 0 |
| `buildWeeklySeries(start, end)` | dateRangeResolver.ts | Monday-aligned weekly buckets for capacity/trends |

---

## Affected Endpoints

| Endpoint | Router File |
|---|---|
| `/api/reports/v2/employee/*` (6 endpoints) | `server/http/domains/reports-v2-employee.router.ts` |
| `/api/reports/v2/client/*` (6 endpoints) | `server/http/domains/reports-v2-client.router.ts` |
| `/api/reports/v2/workload/*` (4 endpoints) | `server/http/domains/reports-v2-workload.router.ts` |
