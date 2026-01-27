# Railway Deployment Verification Checklist

This is a comprehensive, step-by-step guide for verifying Railway deployments. Follow this checklist after every production deployment to ensure the system is functioning correctly.

---

## Part A: Pre-Deploy Local Checks

Before pushing to Railway, verify the following locally:

### 1. Tests Pass
```bash
npm run test
```
Ensure all tests pass before deploying.

### 2. Build Succeeds
```bash
npm run build
```
The build must complete without errors.

### 3. No Interactive DB Push in Production
Verify that `railway.toml` uses the migration script (not `drizzle-kit push`):
```toml
[deploy]
startCommand = "npx tsx server/scripts/migrate.ts && npm run start"
```
Interactive prompts will hang the deployment.

### 4. Run Smoke Tests
```bash
npx vitest run server/tests/tenant-core-flows-smoke.test.ts
```
All schema-related tests should pass.

### 5. Run Production Parity Check
```bash
npx tsx server/scripts/production-parity-check.ts
```
Should output: `Passed: true`

---

## Part B: Railway Startup Verification

After deployment, verify Railway logs:

### 1. Service Stays Running
- Check Railway dashboard: service should show "Running" status
- No crash loops or restarts

### 2. Boot Logs Show Success
Look for these lines in Railway logs:
```
[boot] environment=production version=<commit-sha>
[boot] database=connected
[migrations] status: ok (or skipped if no pending)
```

### 3. No Interactive Schema Prompts
Logs should NOT contain:
- "Do you want to push?"
- "Are you sure?"
- Any prompt waiting for user input

### 4. Health Endpoint Returns OK
```bash
curl https://your-app.railway.app/api/health
```
Expected response:
```json
{
  "ok": true,
  "service": "api",
  "timestamp": "...",
  "version": "abc1234"
}
```

---

## Part C: Auth Sanity Checks

### 1. Login Works on First Attempt
- Navigate to login page
- Enter valid credentials
- Should redirect to dashboard without errors

### 2. Session Persists After Refresh
- After login, refresh the page
- Should remain logged in (not redirected to login)

### 3. Logout Works
- Click logout
- Should redirect to login page
- Refreshing should NOT restore the session

---

## Part D: Super Admin Sanity Checks

### 1. System Status Loads
- Login as Super Admin
- Navigate to System Status
- Should display tenant counts, DB status, and checks

### 2. Error Logs Tab Loads
- Navigate to System Status > Error Logs
- Should display list of error logs (may be empty)
- Filtering by status/date should work

### 3. Schema Diagnostics Endpoint
```bash
curl -H "Cookie: <session>" https://your-app.railway.app/api/v1/status/diagnostics/schema
```
Expected: All tables present, healthy=true

### 4. Tenant Switcher Works
- Open tenant switcher in Super Admin toolbar
- Select a different tenant
- Context should switch (verify in header/breadcrumb)

### 5. Act-as-Client Works
- From Super Admin, "Act as" a client user
- Should see client-restricted view
- "Return to Super Admin" banner should appear
- Clicking return should restore full access

---

## Part E: Tenant Core Flows

### 1. Create Client
- Navigate to Clients
- Click "Add Client"
- Fill required fields and save
- Should appear in client list
- **Verify**: Check that `tenantId` is populated in database

### 2. Create Project (Client Required)
- Navigate to Projects
- Click "Add Project"
- Select a client (required)
- Fill project details and save
- Should appear in project list

### 3. Create Task (No 500 Errors)
- Open a project
- Click "Add Task"
- Fill task details and save
- Should NOT return 500 error
- Task should appear in project view

### 4. Create Subtask
- Open an existing task
- Click "Add Subtask"
- Fill subtask details and save
- Should appear under parent task

### 5. Assign Task and Verify Visibility
- Open a task
- Assign it to a user
- **Verify**: Task appears in assignee's "My Tasks" view
- **Verify**: Task appears in left nav "Assigned to Me" section

---

## Part F: Time Tracking

### 1. Start Timer (Title Present)
- Click timer button
- Select client/project/task
- Enter title/description
- Start timer
- Timer should show running state

### 2. Pause/Resume Timer
- With timer running, click pause
- Timer should stop incrementing
- Click resume
- Timer should continue

### 3. Save Time Entry
- Stop timer
- Confirm client → project → task (or subtask) selection
- Save entry
- Entry should appear in time log

### 4. Edit Time Entry
- Find saved time entry
- Click edit
- Modify duration or description
- Save changes
- Changes should persist

---

## Part G: Notifications

### 1. Endpoints Return 200 (Not 500)
```bash
curl https://your-app.railway.app/api/v1/notifications
```
Expected: 200 with array (even if empty) or 401 if not authenticated

### 2. Notification Preferences Load
- Navigate to Settings > Notifications
- Preferences should load without error
- Toggles should be interactive

---

## Part H: Integrations (Super Admin)

### 1. Mailgun/S3/Stripe Settings Persist
- Navigate to Super Admin > Integrations
- Enter test values (or view existing)
- Save settings
- Refresh page
- Values should persist (shown as masked)

### 2. Integration Status Endpoint
```bash
curl https://your-app.railway.app/api/v1/status/summary
```
Should show:
- `mailgun`: configured/not_configured
- `s3`: configured/not_configured
- `stripe`: configured/not_configured

---

## Part I: Chat (If Enabled)

### 1. Start New Chat
- Open chat panel
- Create new channel or DM
- Should create successfully

### 2. Add Members
- Open channel settings
- Add member to channel
- Member should appear in member list

### 3. Reconnect Without Duplicates
- Refresh page with chat open
- Reconnect to chat
- Messages should NOT duplicate
- Member list should NOT have duplicates

---

## Part J: Error Handling & RequestId

### 1. Trigger a Validation Error
- Submit a form with invalid data
- UI should show error message
- Error should include `requestId`

### 2. Verify RequestId in Super Admin Logs
- Copy the `requestId` from the error
- Navigate to Super Admin > Error Logs
- Search/filter by `requestId`
- Error should appear in logs

### 3. Check Response Headers
```bash
curl -I https://your-app.railway.app/api/health
```
Should include: `X-Request-Id: <uuid>`

---

## If Anything Fails

### 1. Copy the RequestId
From the error response or UI, copy the `requestId` value.

### 2. Check Super Admin Error Logs
- Navigate to System Status > Error Logs
- Filter by the `requestId`
- Review error details, stack trace, and context

### 3. Check Railway Logs
- Open Railway dashboard
- View logs for the service
- Search for the `requestId`
- Look for stack traces or error messages around that time

### 4. Check Schema Diagnostics
```bash
curl -H "Cookie: <session>" https://your-app.railway.app/api/v1/status/diagnostics/schema
```
Look for:
- `healthy: false`
- Missing tables or columns
- Recommended actions

### 5. Rollback Procedure
If critical issues are found:
1. Only revert the last commit batch
2. Push revert to Railway
3. Verify the rollback deployed successfully
4. Re-run this checklist

---

## Quick Reference: Diagnostic Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | None | Service health check |
| `GET /api/v1/status/summary` | Super Admin | System status overview |
| `GET /api/v1/status/error-logs` | Super Admin | Error log list |
| `GET /api/v1/status/diagnostics/schema` | Super Admin | Schema health check |

---

## Deployment Checklist Summary

- [ ] Tests pass locally
- [ ] Build succeeds
- [ ] Smoke tests pass
- [ ] Railway service stays running
- [ ] Boot logs show database connected
- [ ] Health endpoint returns ok
- [ ] Login/logout works
- [ ] Session persists on refresh
- [ ] Super Admin System Status loads
- [ ] Error Logs tab works
- [ ] Schema diagnostics healthy
- [ ] Create client works
- [ ] Create project works
- [ ] Create task (no 500)
- [ ] Time tracking start/stop works
- [ ] Notifications endpoint returns 200
- [ ] Error responses include requestId
