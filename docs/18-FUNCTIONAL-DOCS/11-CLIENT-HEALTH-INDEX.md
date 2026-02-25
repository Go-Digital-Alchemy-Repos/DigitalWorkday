# Client Health Index (CHI) Engine

## Overview

The Client Health Index (CHI) is a composite 0–100 score that aggregates key client relationship metrics into a single health signal per client. It is fully tenant-scoped, additive-only, and feature-flagged.

**Feature flag**: `ENABLE_CLIENT_HEALTH_INDEX`  
**Default**: `true` in development, `false` in production  
**API endpoint**: `GET /api/reports/v2/client/health-index`  
**UI location**: Client Command Center → Health tab

---

## Score Formula

```
CHI = (overdueScore      × 0.25)
    + (engagementScore   × 0.20)
    + (timeOverrunScore  × 0.20)
    + (slaComplianceScore × 0.20)
    + (activityScore     × 0.15)
```

### Component Weights

| Component       | Weight | Description                                               |
|-----------------|--------|-----------------------------------------------------------|
| Overdue Rate    | 25%    | Inverse of overdue task ratio across all client tasks     |
| Engagement      | 20%    | Composite of time logged + comment activity in the range  |
| Time Overrun    | 20%    | Actual vs estimated hours variance (lower = better)       |
| SLA Compliance  | 20%    | % of tasks completed on or before due date                |
| Activity        | 15%    | Inverse of days since last activity                       |

---

## Component Normalization Rules

### Overdue Score (Inverse)
- Input: `overdueCount / totalTasks` (overdue rate)
- Score = `max(0, round((1 - overdueRate × 2) × 100))`
- 0% overdue → 100 points. 50%+ overdue → 0 points.
- No tasks (empty client) → 80 (soft neutral).

### Engagement Score (Composite)
- Time portion: `min(50, (min(totalHours, 40) / 40) × 50)` — maxes out at 40h = 50 pts
- Comment portion: `min(50, (min(commentCount, 10) / 10) × 50)` — maxes out at 10 comments = 50 pts
- Combined score: capped at 100.
- No hours or comments → 0.

### Time Overrun Score
- Input: `totalHours / estimatedHours` (overrun ratio)
- ratio ≤ 1.0 → score 100
- ratio 1.0–1.5 → linearly degrades from 100→50
- ratio 1.5–2.0 → linearly degrades from 50→0
- ratio > 2.0 → score 0
- No estimates → neutral 50.

### SLA Compliance Score
- Input: `completedOnTime / totalDoneWithDue × 100`
- Linear 0–100.
- No tasks with due dates → neutral 60.

### Activity Score (Inverse)
- Input: `daysSinceLastActivity`
- 0 days → 100, 30+ days → 0 (linear decay)
- No activity ever recorded → 0.
- Looks at `MAX(task.updated_at, time_entry.start_time)`.

---

## Health Tiers

| Tier      | Score Range | Color  | Meaning                                              |
|-----------|-------------|--------|------------------------------------------------------|
| Healthy   | 85–100      | Green  | Client relationship performing well across all areas |
| Monitor   | 70–84       | Blue   | Acceptable range but warrants attention              |
| At Risk   | 50–69       | Orange | One or more metrics require immediate attention      |
| Critical  | 0–49        | Red    | Multiple failing health indicators                   |

---

## Risk Flag Definitions

| Flag                                          | Trigger Condition                                                          |
|-----------------------------------------------|----------------------------------------------------------------------------|
| High overdue task rate (>30%)                 | `overdueCount / totalTasks > 0.3`                                          |
| No activity in N days                         | `daysSinceLastActivity > 21`                                               |
| Time significantly over estimate (>150%)      | `totalHours > estimatedHours × 1.5` AND `estimatedHours > 0`              |
| Active projects with no time logged recently  | `activeProjects > 0` AND `totalHoursInRange < 1` AND `inactivity > 14d`   |
| Less than 50% of tasks completed on time      | `completedOnTime / totalDoneWithDue < 0.5` AND `totalDoneWithDue > 0`     |

---

## SLA Logic Assumptions

- SLA compliance is measured as: `status = 'done' AND updated_at <= due_date AND due_date IS NOT NULL`
- Only tasks with a due date that are completed are included in compliance calculations
- Tasks without due dates are excluded from SLA metrics but still affect overdue and engagement scores
- SLA is computed at the task level, not project or contract level

---

## API

### `GET /api/reports/v2/client/health-index`

**Auth**: Requires authenticated tenant session. Protected by `reportingGuard`.

**Query Parameters**:

| Parameter    | Type   | Description                           |
|--------------|--------|---------------------------------------|
| `days`       | number | Range in days from today (default 30) |
| `startDate`  | date   | Explicit start date (overrides days)  |
| `endDate`    | date   | Explicit end date (overrides days)    |
| `clientId`   | string | Filter to a single client             |
| `limit`      | number | Pagination limit (default 50)         |
| `offset`     | number | Pagination offset (default 0)         |

**Response**:

```json
{
  "clients": [
    {
      "clientId": "abc123",
      "companyName": "Acme Corp",
      "overallScore": 76,
      "healthTier": "Monitor",
      "componentScores": {
        "overdue": 90,
        "engagement": 60,
        "timeOverrun": 80,
        "slaCompliance": 70,
        "activity": 65
      },
      "riskFlags": [],
      "rawMetrics": {
        "totalTasks": 24,
        "overdueCount": 2,
        "completedOnTime": 7,
        "totalDoneWithDue": 10,
        "totalHoursInRange": 18.5,
        "estimatedHours": 20,
        "commentCount": 4,
        "daysSinceLastActivity": 3,
        "activeProjects": 2
      }
    }
  ],
  "pagination": { "total": 8, "limit": 50, "offset": 0 },
  "range": { "startDate": "2026-01-26", "endDate": "2026-02-25" }
}
```

---

## Architecture

| Layer          | File                                                               |
|----------------|--------------------------------------------------------------------|
| Health model   | `server/reports/health/clientHealthModel.ts`                      |
| Calculation    | `server/reports/health/calculateClientHealth.ts`                  |
| API endpoint   | `server/http/domains/reports-v2-client.router.ts` (`/client/health-index`) |
| Frontend tab   | `client/src/components/reports/client-command-center.tsx` (HealthTab) |
| Feature flag   | `ENABLE_CLIENT_HEALTH_INDEX` in `server/config.ts`                |

---

## Known Limitations

- CHI scores are point-in-time for the selected date range, not rolling or cumulative averages.
- Engagement score uses time entries and comments as proxies. Direct messaging metrics (e.g., email opens, portal logins) are not yet included.
- SLA compliance measures task-level on-time completion, not response time SLA (no response time data is currently captured).
- Activity score uses `MAX(task.updated_at, time_entry.start_time)`. Client portal logins and email reads are not factored in.
- Clients with no tasks at all will receive a mostly-neutral score and should be excluded from trend analysis.
