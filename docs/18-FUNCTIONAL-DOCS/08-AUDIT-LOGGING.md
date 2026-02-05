# Audit Logging

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The audit logging system captures significant actions and changes throughout the application for compliance, debugging, and activity tracking. It records who did what, when, and with what data, providing a comprehensive audit trail.

---

## Who Uses It

| Role | Access Level |
|------|--------------|
| **Super Admin** | View all audit logs, export, configure retention |
| **Admin** | View tenant audit logs |
| **Manager** | View project/team activity logs |
| **Member** | View own activity |

---

## Data Model

### Activity Logs

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope (null for system events) |
| `userId` | UUID | User who performed action |
| `action` | string | Action type (see below) |
| `entityType` | string | Entity affected (project, task, user) |
| `entityId` | UUID | ID of affected entity |
| `oldData` | jsonb | Previous state (for updates) |
| `newData` | jsonb | New state (for creates/updates) |
| `metadata` | jsonb | Additional context (IP, user agent) |
| `requestId` | string | Correlation ID for request tracing |
| `createdAt` | timestamp | When event occurred |

### Action Types

| Category | Actions |
|----------|---------|
| **Auth** | `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `PASSWORD_RESET` |
| **User** | `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `ROLE_CHANGED` |
| **Project** | `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED` |
| **Task** | `TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `TASK_ASSIGNED` |
| **Time** | `TIME_ENTRY_CREATED`, `TIME_ENTRY_UPDATED`, `TIMER_STARTED` |
| **Client** | `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_DELETED` |
| **Admin** | `SETTINGS_CHANGED`, `INTEGRATION_CONFIGURED` |

---

## Key Flows

### 1. Automatic Logging

```
User performs action → Controller/Service layer
    ↓
Action triggers activity log creation
    ↓
Capture: userId, action, entity, changes, requestId
    ↓
Insert into activity_logs table
    ↓
(No blocking - async insert)
```

### 2. Request Correlation

```
Request received → Generate requestId (UUID)
    ↓
Attach to req.requestId
    ↓
All logs in this request use same requestId
    ↓
Enables full request tracing
```

### 3. Diff Logging

```
Entity update requested
    ↓
Fetch current state → Store as oldData
    ↓
Apply update
    ↓
Fetch new state → Store as newData
    ↓
Log includes full before/after comparison
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Bulk operations** | Individual log per entity, same requestId |
| **System actions** | userId = null, marked as system |
| **Sensitive data** | Password fields stripped from logs |
| **Log write failure** | Error logged to console, action continues |
| **High volume** | Async batch insert, no blocking |
| **Old data retrieval fails** | Log without oldData, flag incomplete |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Activity Feed** | Project/Task pages | Recent activity stream |
| **Audit Log Viewer** | Super Admin > Audit | Searchable log viewer |
| **Export Logs** | Super Admin > Audit | CSV/JSON export |
| **Retention Policy** | Super Admin > Settings | How long to keep logs |
| **Log Filters** | Audit viewer | Filter by user, action, date |

---

## What Gets Logged

### Always Logged

| Event | Data Captured |
|-------|---------------|
| User login/logout | userId, IP, user agent, success/failure |
| Role changes | oldRole, newRole, changedBy |
| Project/Task CRUD | Full entity data |
| Time entries | Duration, project, task |
| Settings changes | Setting key, old/new values |

### Not Logged

| Event | Reason |
|-------|--------|
| Read operations | Too high volume |
| Internal system calls | Noise reduction |
| Passwords | Security |
| Session tokens | Security |

---

## Retention

| Environment | Default Retention | Notes |
|-------------|-------------------|-------|
| Development | 30 days | Auto-cleanup |
| Production | 1 year | Configurable |
| Compliance | 7 years | For regulated industries |

---

## Request ID Tracing

Every request is assigned a unique `requestId` that appears in:
- Activity logs
- Error logs
- Console output
- Response headers (`X-Request-Id`)

This enables tracing a user's action through the entire system.

---

## Related Documentation

- [Error Logging](../ERROR_LOGGING.md)
- [Error Handling](../ERROR_HANDLING.md)
