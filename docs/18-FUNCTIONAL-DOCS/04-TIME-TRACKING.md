# Time Tracking

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The time tracking system allows users to log time against tasks and projects. It supports both manual entry and a live stopwatch timer with cross-session persistence. Time entries feed into reports, workload forecasting, and project budget tracking.

---

## Who Uses It

| Role | Capabilities |
|------|--------------|
| **Super Admin** | View all tenant time data, export |
| **Admin** | View/edit all tenant time entries, approve, export |
| **Manager** | View team time entries, approve, run reports |
| **Member** | Log own time, view own entries |
| **Viewer** | No time tracking access |

---

## Data Model

### Time Entries

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `userId` | UUID | Who logged the time |
| `taskId` | UUID | Associated task (optional) |
| `projectId` | UUID | Associated project |
| `description` | string | Work description |
| `startTime` | timestamp | Entry start time |
| `endTime` | timestamp | Entry end time |
| `duration` | integer | Duration in seconds |
| `billable` | boolean | Is this billable time? |
| `approved` | boolean | Manager approval status |
| `approvedBy` | UUID | Who approved |
| `approvedAt` | timestamp | When approved |

### Active Timers

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | Timer owner |
| `tenantId` | UUID | Tenant scope |
| `taskId` | UUID | Task being timed (optional) |
| `projectId` | UUID | Project being timed |
| `description` | string | Work description |
| `startedAt` | timestamp | When timer started |
| `pausedAt` | timestamp | When paused (null if running) |
| `accumulatedSeconds` | integer | Time accumulated before current run |

---

## Key Flows

### 1. Start Timer

```
User clicks Start → POST /api/timer/start
    ↓
Create active_timer record
    ↓
Frontend shows running stopwatch (synced with server time)
```

### 2. Stop Timer

```
User clicks Stop → POST /api/timer/stop
    ↓
Calculate duration: (now - startedAt) + accumulatedSeconds
    ↓
Create time_entry record
Delete active_timer record
    ↓
Emit socket event: time-entry-created
```

### 3. Manual Entry

```
User opens manual entry form
    ↓
POST /api/v1/time-entries
    ↓
Validate: duration > 0, valid project/task
    ↓
Create time_entry record
```

### 4. Cross-Session Persistence

```
User has active timer → Closes browser
    ↓
Timer continues running on server
    ↓
User reopens app → GET /api/timer/current
    ↓
Resume timer display from server state
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Timer running > 24 hours** | Warning shown, auto-stop option |
| **Overlapping entries** | Allowed but flagged in reports |
| **Edit after approval** | Requires re-approval |
| **Delete approved entry** | Admin only, logged in audit |
| **Timer on deleted task** | Timer continues, entry has null taskId |
| **Timezone changes** | All times stored in UTC |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **My Time** | Time Tracking page | View/edit own entries |
| **Team Time** | Reports > Time | View team time entries |
| **Approve Entries** | Reports > Time | Bulk approve time entries |
| **Edit Any Entry** | Reports > Time | Admin edit of any entry |
| **Export Time** | Reports > Export | CSV/Excel export |
| **Time Policies** | Settings > Time | Billable defaults, required fields |
| **Timer Settings** | Settings > Time | Auto-stop rules, reminders |

---

## Calculations

### Duration

```typescript
// If timer is running:
currentDuration = accumulatedSeconds + (now - startedAt)

// If timer is paused:
currentDuration = accumulatedSeconds

// Final entry:
duration = accumulatedSeconds + (stoppedAt - startedAt)
```

### Budget Utilization

```typescript
projectTimeSpent = SUM(time_entries.duration) WHERE projectId = X
budgetUtilization = projectTimeSpent / project.budgetHours * 100
```

---

## Related Documentation

- [Workload Reports](../workloadReports/)
- [Workload Forecast](../workloadForecast/)
