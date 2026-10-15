# Notifications

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The notification system delivers alerts to users about relevant events in the application. It supports in-app notifications with real-time delivery via Socket.IO, and email notifications for important events. Users can customize which notifications they receive.

---

## Who Uses It

| Role | Receives |
|------|----------|
| **All Users** | Notifications based on their preferences and role |
| **Admin** | Can configure tenant-wide notification settings |
| **Super Admin** | System-wide notification configuration |

---

## Data Model

### Notifications

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `userId` | UUID | Recipient user ID |
| `type` | enum | Notification type (see below) |
| `title` | string | Notification title |
| `message` | string | Notification body |
| `data` | jsonb | Additional context (taskId, projectId, etc.) |
| `read` | boolean | Has user seen this? |
| `readAt` | timestamp | When marked as read |
| `createdAt` | timestamp | When created |

### Notification Types

| Type | Trigger |
|------|---------|
| `TASK_ASSIGNED` | User assigned to a task |
| `TASK_COMPLETED` | Task marked as done |
| `TASK_DUE_SOON` | Task due within 24 hours |
| `TASK_OVERDUE` | Task past due date |
| `COMMENT_ADDED` | New comment on subscribed task |
| `COMMENT_MENTION` | User @mentioned in comment |
| `PROJECT_UPDATED` | Project settings changed |
| `TIMER_REMINDER` | Timer running too long |

### User Preferences

| Field | Type | Description |
|-------|------|-------------|
| `userId` | UUID | User ID |
| `notificationType` | string | Notification type |
| `inApp` | boolean | Show in-app notification |
| `email` | boolean | Send email notification |
| `enabled` | boolean | Master toggle for this type |

---

## Key Flows

### 1. In-App Notification

```
Event occurs (task assigned)
    ↓
Create notification record
    ↓
Emit socket: notification-created
    ↓
Frontend shows toast + updates bell icon
```

### 2. Email Notification

```
Event occurs → Check user preferences
    ↓
If email enabled for this type:
    ↓
Queue email via Mailgun
    ↓
Send asynchronously
```

### 3. @Mention Notification

```
Comment saved with @[Name](userId)
    ↓
Parse mentions from content
    ↓
Create COMMENT_MENTION notification for each user
    ↓
Real-time delivery via socket
```

### 4. Mark as Read

```
User clicks notification → PATCH /api/v1/notifications/:id/read
    ↓
Set read = true, readAt = now
    ↓
Update unread count in UI
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **User has notifications disabled** | Skip notification creation |
| **Email delivery failure** | Retry 3x, log failure |
| **Bulk notifications** | Debounce/batch within 5 seconds |
| **User deleted** | Notifications orphaned, cleaned up periodically |
| **Mention non-existent user** | Silently ignored |
| **Notification flood** | Rate limit per user per type |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Notification Preferences** | Settings > Notifications | Per-type toggles |
| **Email Settings** | Settings > Notifications | Global email on/off |
| **Quiet Hours** | Settings > Notifications | Do not disturb periods |
| **Digest Mode** | Settings > Notifications | Daily digest vs real-time |
| **System Notifications** | Super Admin > Broadcast | Send to all users |

---

## Delivery Channels

| Channel | Implementation | Status |
|---------|----------------|--------|
| **In-App** | Socket.IO real-time | ✅ Active |
| **Email** | Mailgun integration | ✅ Active |
| **SMS** | Not implemented | ❌ Planned |
| **Push** | Not implemented | ❌ Planned |

---

## Related Documentation

- [Chat System](../CHAT.md)
- [Email Observability](../EMAIL_OBSERVABILITY.md)

## Project assignment emails

Assignment emails are opt-in at two levels:

- An administrator or project manager enables **Email new assignees** in Project Settings (`projects.assignmentEmailsEnabled`). Existing and new projects default to off.
- Each recipient enables **Assignment emails** in Notification Center settings. This uses the existing `notification_preferences.email_enabled` field and preserves its existing value and false default. In-app preferences are independent.

The internal task UI sends emails for newly added task or subtask assignees, including task creation, child task creation, and assignee changes through task updates. Selecting an assignee saves immediately. Unchanged assignees, self-assignments, personal tasks, imports, bulk administration, and client portal assignment paths do not generate these emails. Enabling a project does not notify existing assignees.

Interactive assignments and their delivery jobs commit in one database transaction. The existing background queue processes `assignment_email` jobs with up to three attempts, using the existing `task_assignment` template, Mailgun configuration fallback, application link builder, and email logs. Before sending, the worker rechecks project opt-in, recipient email opt-in, active recipient status, tenant boundaries, task/project visibility, and the original assignment ID. Removing and re-adding an assignee invalidates the old delivery job. A job already logged as sent is skipped on replay.

Delivery has the usual at-least-once limitation: if Mailgun accepts a message but the process fails before recording success, a retry can send it again. Normal repeated assignment requests are deduplicated by the assignment's unique database constraint.

Other notifications retain their existing behavior: comment mentions, invitations, password emails, in-app assignment calls, and status/completion notifications are not rerouted through this feature. The personal email control is shown once because the database stores one flag; it governs this assignment email feature, not existing mention or transactional emails.

Deployment requires migration `0064_project_assignment_emails`. The existing Railway `AUTO_MIGRATE=true` startup path applies it. No new environment variables or provider credentials are required. Task links are resolved with the existing trusted-host/public-URL helper during the assignment request and persisted with the job, so background delivery does not depend on request headers or a new URL setting. Disabling the project toggle cancels pending emails when the worker rechecks eligibility. To roll back application code, leave the additive column in place.
