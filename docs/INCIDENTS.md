# Incident Log

This document tracks production incidents, root causes, and fixes for reference and prevention.

---

## INCIDENT-2026-01-26-001: Task Creation 500 Error in Tenant Accounts

### Summary
Task creation was failing with HTTP 500 ("Unable to save") for tenant users in production (Railway).

### Affected Endpoints
- `POST /api/tasks` - Main task creation
- `POST /api/tasks/personal` - Personal task creation
- `POST /api/tasks/:taskId/childtasks` - Child task creation
- `POST /api/tasks/:taskId/assignees` - Adding task assignees

### Root Cause Analysis

**Primary Issue: Missing tenantId on Task Assignees**
The `addTaskAssignee` function was being called without the `tenantId` parameter. While the `task_assignees.tenant_id` column is nullable in the database, this created:
1. Data integrity issues - assignees lacked tenant context
2. Potential foreign key chain problems in complex queries
3. Race conditions where the assignee creation could fail silently

**Secondary Issue: Unhandled Exceptions**
The `addTaskAssignee` call was not wrapped in try-catch, so any database error during assignee creation would bubble up as a 500 error even though the task itself was created successfully.

**Legacy Data Issue**
Some projects in the database have `tenant_id = NULL` (created before tenant enforcement). When tenant users try to create tasks for these projects, `getProjectByIdAndTenant` returns undefined, causing a 400 error (not 500).

### Fix Applied

1. **Added tenantId to all addTaskAssignee calls**:
   - `POST /api/tasks` - Line 1633
   - `POST /api/tasks/personal` - Line 1388
   - `POST /api/tasks/:taskId/childtasks` - Line 1700
   - `POST /api/tasks/:taskId/assignees` - Line 1903

2. **Wrapped assignee creation in try-catch**:
   - Auto-assignment now fails gracefully with a warning log
   - Task creation still succeeds even if assignee fails

3. **Improved error logging**:
   - All error responses now include `requestId`
   - Structured logging format: `[Route Error] requestId=... userId=... tenantId=... error=...`

### Files Changed
- `server/routes.ts` - Task creation endpoints

### Testing
- Existing tests: `server/tests/tenant-task-create.test.ts`
- Test coverage:
  - Create task with valid project (tenant-scoped)
  - Create task validates project belongs to tenant
  - Create task rejects cross-tenant project
  - Create personal task (no project)
  - Error responses include requestId only (no stack traces)

### Verification Checklist

**Local Testing:**
- [ ] Create task as tenant admin → succeeds with tenantId
- [ ] Create task as tenant employee → succeeds with tenantId
- [ ] Create personal task → succeeds with isPersonal=true
- [ ] Create task for project with null tenantId → returns 400, not 500
- [ ] All error responses include requestId in body

**Railway Verification:**
- [ ] Deploy changes
- [ ] Create task in tenant account → succeeds
- [ ] Check error_logs table for any new 500s on task routes

### Using RequestId for Debugging

1. When a user reports "Unable to create task", ask for the Request ID from the error toast
2. In Super Admin > Error Logs, search by request_id
3. Error log entry shows: path, method, error_name, message, db_code, db_constraint, meta

### Prevention

- All `addTaskAssignee` calls must include `tenantId` parameter
- All storage operations that could fail should be wrapped in try-catch
- Error responses must always include `requestId` for correlation

---

## INCIDENT-2026-01-26-002: Production SESSION_SECRET Not Enforced

### Summary
Application could start in production without SESSION_SECRET configured, causing sessions to use a weak default secret and potentially allowing session hijacking.

### Affected Components
- Session management in `server/auth.ts`
- All authenticated routes

### Root Cause Analysis
The session middleware was using a fallback default value (`replit_dev_secret`) when `SESSION_SECRET` was not set. This worked fine for development but created a security vulnerability if accidentally deployed to production without the environment variable configured.

### Fix Applied
Added a fail-fast guard at the start of `setupAuth()` that throws a fatal error if `NODE_ENV=production` and `SESSION_SECRET` is missing:

```typescript
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is required in production. " +
    "Sessions cannot be securely encrypted without it. " +
    "Set SESSION_SECRET to a strong random string (minimum 32 characters)."
  );
}
```

### Files Changed
- `server/auth.ts` - Added production SESSION_SECRET enforcement

### Prevention
- Production deployments now fail immediately with a clear error message if SESSION_SECRET is not configured
- Developers are reminded to set SESSION_SECRET before deployment

---

## INCIDENT-2026-01-26-003: Password Reset Email Not Delivered

### Summary
Password reset requests logged a TODO comment but never actually sent emails to users, leaving them unable to reset passwords in production.

### Affected Endpoints
- `POST /api/v1/auth/forgot-password`

### Root Cause Analysis
The password reset flow was incomplete - it generated reset tokens and logged them to console in development, but had a TODO comment for email delivery that was never implemented.

### Fix Applied
Integrated with existing `EmailOutboxService` to send password reset emails via Mailgun:

1. Added email sending via `emailOutboxService.sendEmail()` with:
   - Tenant-scoped configuration lookup
   - HTML and plain text email body
   - Request ID for debugging
   - User metadata for audit trail

2. Graceful degradation:
   - If user has no tenantId, email cannot be sent (no Mailgun config)
   - If Mailgun is not configured for tenant, email silently fails
   - Reset URL is still logged in development for testing

### Files Changed
- `server/auth.ts` - Implemented password reset email delivery

### Prevention
- New authentication features must have complete email delivery before being considered production-ready
- Email delivery should be tested end-to-end with tenant Mailgun configuration

---

## INCIDENT-2026-01-26-004: Timer Pause Shows Incorrect Elapsed Time

### Summary
When pausing a running timer, the display would briefly show "00:00:00" or an old elapsed time before the server response arrived, causing user confusion.

### Affected Components
- `client/src/hooks/use-active-timer.ts`
- `client/src/features/timer/global-active-timer.tsx`

### Root Cause Analysis
The optimistic update on pause only updated `status: "paused"` but did not update `elapsedSeconds`. Since the timer display calculates elapsed time differently based on status:
- Running: `elapsedSeconds + (now - lastStartedAt)`
- Paused: `elapsedSeconds` only

When status changed to "paused" optimistically, the display used the old `elapsedSeconds` value (often 0 if this was the first session), causing incorrect display until the server response arrived with the correct value.

### Fix Applied
Updated pause optimistic updates in both components to calculate and include `elapsedSeconds`:

```typescript
onMutate: async () => {
  // Calculate elapsed seconds to match server-side pause behavior
  let newElapsedSeconds = previousTimer.elapsedSeconds;
  if (previousTimer.status === "running" && previousTimer.lastStartedAt) {
    const lastStarted = new Date(previousTimer.lastStartedAt).getTime();
    const now = Date.now();
    newElapsedSeconds += Math.floor((now - lastStarted) / 1000);
  }
  
  queryClient.setQueryData({
    ...previousTimer,
    status: "paused",
    elapsedSeconds: newElapsedSeconds,
  });
}
```

### Files Changed
- `client/src/hooks/use-active-timer.ts` - Fixed pause optimistic update
- `client/src/features/timer/global-active-timer.tsx` - Fixed pause optimistic update

### Prevention
- Optimistic updates must mirror server-side calculations exactly
- Timer-related optimistic updates should update all derived fields, not just status

---

## Template for New Incidents

```markdown
## INCIDENT-YYYY-MM-DD-NNN: Brief Title

### Summary
One-line description of the issue.

### Affected Endpoints
- `METHOD /path` - Description

### Root Cause Analysis
What caused the issue.

### Fix Applied
What was changed.

### Files Changed
- `path/to/file.ts` - What changed

### Testing
Test coverage and commands.

### Verification Checklist
- [ ] Step 1
- [ ] Step 2

### Prevention
How to prevent similar issues.
```
