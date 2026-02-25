# Employee Performance Index (EPI) Engine

## Overview

The Employee Performance Index (EPI) is a standardized, composite operational score that aggregates existing reporting metrics into a single 0–100 score per employee. It is fully tenant-scoped, additive-only, and feature-flagged.

**Feature flag**: `ENABLE_EMPLOYEE_PERFORMANCE_INDEX`  
**Default**: `true` in development, `false` in production  
**API endpoint**: `GET /api/reports/v2/employee/performance`  
**UI location**: Employee Command Center → Performance tab

---

## Score Formula

The EPI score is a weighted sum of five normalized component scores, each on a 0–100 scale:

```
EPI = (completionScore × 0.25)
    + (overdueScore    × 0.20)
    + (utilizationScore × 0.20)
    + (efficiencyScore × 0.20)
    + (complianceScore × 0.15)
```

### Component Weights

| Component         | Weight | Description                                    |
|-------------------|--------|------------------------------------------------|
| Completion Rate   | 25%    | % of tasks completed in the selected range     |
| Overdue Rate      | 20%    | Inverse of overdue task ratio                  |
| Utilization       | 20%    | Hours worked vs. available capacity (8h/day)   |
| Efficiency        | 20%    | Actual vs. estimated hours ratio               |
| Time Compliance   | 15%    | % of working days with at least one time entry |

---

## Component Normalization Rules

### Completion Rate Score
- Input: `completedInRange / (completedInRange + activeTasks) × 100`
- Normalization: Linear 0–100. No data → 50 (neutral).

### Overdue Score (Inverse)
- Input: `overdueCount / activeTasks` (overdue rate, 0–1)
- Score = `max(0, round((1 - overdueRate × 2) × 100))`
- 0% overdue → 100 points. 50%+ overdue → 0 points.

### Utilization Score (Optimal Band)
- Input: `totalHours / (daysInRange × 8) × 100` (utilization %)
- 70–95%: score 100
- 50–70%: linearly degrades from 50→100
- 95–120%: linearly degrades from 100→50
- >120% (up to 150%): linearly degrades from 50→0
- Below 50%: score 0. No data → 40 (below average).

### Efficiency Score (Optimal Band)
- Input: `totalHours / estimatedHours` (efficiency ratio)
- 0.9–1.2: score 100
- 0.7–0.9: linearly degrades from 60→100
- 1.2–1.5: linearly degrades from 100→60
- Outside 0.7–1.5: score 20. No estimates → 50 (neutral).

### Time Compliance Score
- Input: `distinctDaysWithTimeEntry / daysInRange × 100`
- Linear 0–100.

---

## Performance Tiers

| Tier             | Score Range | Color  | Meaning                                        |
|------------------|-------------|--------|------------------------------------------------|
| High             | 85–100      | Green  | Performing above expectations                  |
| Stable           | 70–84       | Blue   | Within acceptable range                        |
| Needs Attention  | 50–69       | Orange | One or more metrics require improvement        |
| Critical         | 0–49        | Red    | Multiple metrics below acceptable thresholds   |

---

## Risk Flags

The engine automatically generates risk flags when:

| Flag                                     | Condition                                                     |
|------------------------------------------|---------------------------------------------------------------|
| High overdue rate (>30%)                 | `overdueRate > 0.3` AND `overdueCount >= 2`                   |
| Overutilized (>120% capacity)            | `utilizationPct > 120`                                        |
| Low time compliance — few days logged    | `timeCompliancePct < 30` AND `totalHours < 1`                 |
| Significantly over time estimates        | `efficiencyRatio > 1.5`                                       |
| Low task completion rate                 | `completionRate < 20%` AND `activeTasks >= 3`                 |

---

## API

### `GET /api/reports/v2/employee/performance`

**Auth**: Requires authenticated tenant session. Protected by `reportingGuard`.

**Query Parameters** (shared with all Employee CC endpoints):

| Parameter   | Type   | Description                           |
|-------------|--------|---------------------------------------|
| `days`      | number | Range in days from today (default 30) |
| `startDate` | date   | Explicit start date (overrides days)  |
| `endDate`   | date   | Explicit end date (overrides days)    |
| `userId`    | string | Filter to a single employee           |
| `limit`     | number | Pagination limit (default 50)         |
| `offset`    | number | Pagination offset (default 0)         |

**Response**:

```json
{
  "employees": [
    {
      "userId": "abc123",
      "firstName": "Alice",
      "lastName": "Smith",
      "email": "alice@example.com",
      "avatarUrl": null,
      "overallScore": 78,
      "performanceTier": "Stable",
      "componentScores": {
        "completion": 85,
        "overdue": 100,
        "utilization": 72,
        "efficiency": 50,
        "compliance": 60
      },
      "riskFlags": [],
      "rawMetrics": {
        "activeTasks": 8,
        "overdueCount": 0,
        "completedInRange": 5,
        "totalHours": 28.5,
        "estimatedHours": 0,
        "loggedDays": 9,
        "daysInRange": 30,
        "utilizationPct": 74,
        "efficiencyRatio": null,
        "completionRate": 38,
        "overdueRate": 0,
        "timeCompliancePct": 30
      }
    }
  ],
  "pagination": { "total": 12, "limit": 50, "offset": 0 },
  "range": { "startDate": "2026-01-26", "endDate": "2026-02-25" }
}
```

---

## UI

The Performance tab appears in the Employee Command Center when `enableEmployeePerformanceIndex` is `true`.

Features:
- Sortable table by name, overall score, or any component
- Per-row component breakdown progress bars (Completion, Overdue, Utilization, Efficiency, Compliance)
- Tier badges color-coded (High=green, Stable=blue, Needs Attention=orange, Critical=red)
- Risk flag tooltips per row
- Skeleton loading state

---

## Architecture

| Layer         | File                                                                 |
|---------------|----------------------------------------------------------------------|
| Score model   | `server/reports/performance/employeePerformanceModel.ts`            |
| Calculation   | `server/reports/performance/calculateEmployeePerformance.ts`        |
| API endpoint  | `server/http/domains/reports-v2-employee.router.ts` (`/employee/performance`) |
| Frontend tab  | `client/src/components/reports/employee-command-center.tsx` (PerformanceTab) |
| Feature flag  | `ENABLE_EMPLOYEE_PERFORMANCE_INDEX` in `server/config.ts`           |

---

## Governance Rules

1. **Non-destructive**: No existing tables, columns, or API routes are modified.
2. **Tenant-scoped**: All DB queries filter by `tenant_id`. No cross-tenant data leakage.
3. **No raw DB duplication**: Uses the same SQL primitives as existing employee endpoints.
4. **Feature-flagged**: Fully disabled when `ENABLE_EMPLOYEE_PERFORMANCE_INDEX=false`.
5. **Metric consistency**: Calls `validateMetricConsistency()` from the Metric Governance layer.

---

## Limitations

- EPI scores are point-in-time for the selected date range, not rolling/cumulative.
- Utilization assumes an 8-hour working day (configurable in future versions).
- Efficiency score returns neutral (50) when no task estimates exist.
- Time compliance counts calendar days, not working days (weekend filtering is a future enhancement).
- Scores below 30 days of data may not be statistically meaningful.
