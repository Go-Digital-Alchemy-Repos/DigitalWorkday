# MyWorkDay - Audit Checklist

## Overview
This document catalogs all major feature areas in the application for quality auditing purposes.

---

## 1. Authentication & Authorization

### Endpoints
- `POST /api/login` - User login
- `POST /api/logout` - User logout  
- `GET /api/user` - Get current user
- `POST /api/register` - User registration
- `POST /api/register/:inviteToken` - Register via invitation

### Components/Pages
- `client/src/pages/login.tsx`
- `server/auth.ts`

### Middleware
- `server/middleware/authContext.ts` - Sets auth context
- `requireAuth` - Ensures authenticated user
- `requireAdmin` - Ensures admin role

### Common Failure Modes
- [ ] Session expiration not handled gracefully
- [ ] Login with invalid credentials returns proper error
- [ ] Password hashing uses secure algorithm
- [ ] Session cookies are httpOnly and secure

---

## 2. Multi-Tenancy

### Endpoints
- All endpoints should respect tenant scoping
- Super admin routes bypass tenant restrictions

### Middleware
- `server/middleware/tenantContext.ts` - Sets tenant context
- `server/middleware/tenancyEnforcement.ts` - Enforces tenant isolation
- `server/middleware/tenantStatusGuard.ts` - Blocks inactive tenants

### Configuration
- `TENANCY_ENFORCEMENT` env var: off | soft | strict

### Common Failure Modes
- [ ] Tenant A can access Tenant B data
- [ ] Super admin blocked by tenant guard
- [ ] Missing tenant_id on new records
- [ ] Tenant status not checked on API calls

---

## 3. Super Admin

### Endpoints (server/routes/superAdmin.ts + routes.ts)
- `GET /api/super/tenants` - List all tenants
- `POST /api/super/tenants` - Create tenant
- `PATCH /api/super/tenants/:id` - Update tenant
- `POST /api/super/tenants/:id/activate` - Activate tenant
- `POST /api/super/tenants/:id/suspend` - Suspend tenant
- `POST /api/super/tenants/:id/deactivate` - Deactivate tenant
- `POST /api/super/tenants/:id/invitations` - Invite tenant admin
- `POST /api/super/tenants/:id/users` - Add user to tenant
- `POST /api/super/tenants/:id/users/import` - Bulk CSV import

### Components/Pages
- `client/src/pages/super-admin.tsx`
- `client/src/components/super-admin/tenant-settings-dialog.tsx`

### Common Failure Modes
- [ ] Non-super user can access /super/* routes
- [ ] Tenant activation fails silently
- [ ] CSV import doesn't validate email format
- [ ] "Act as tenant" mode leaks to wrong users

---

## 4. Tenant Onboarding

### Endpoints (server/routes/tenantOnboarding.ts)
- `GET /api/tenant/onboarding/state` - Get onboarding state
- `PATCH /api/tenant/onboarding/step/:step` - Update step
- `POST /api/tenant/onboarding/complete` - Complete onboarding

### Components/Pages
- `client/src/pages/tenant-onboarding.tsx`

### Common Failure Modes
- [ ] Onboarding can be skipped
- [ ] Already completed tenants shown onboarding
- [ ] Step validation bypassed

---

## 5. Workspaces

### Endpoints
- `GET /api/workspaces` - List workspaces
- `GET /api/workspaces/current` - Get current workspace
- `GET /api/workspaces/:id` - Get workspace by ID
- `POST /api/workspaces` - Create workspace
- `PATCH /api/workspaces/:id` - Update workspace
- `GET /api/workspaces/:workspaceId/members` - Get members
- `POST /api/workspaces/:workspaceId/members` - Add member
- `GET /api/workspace-members` - Get all workspace members

### Common Failure Modes
- [ ] User can access workspace they're not member of
- [ ] Deleting workspace doesn't clean up related data

---

## 6. Teams

### Endpoints
- `GET /api/teams` - List teams
- `GET /api/teams/:id` - Get team
- `POST /api/teams` - Create team
- `PATCH /api/teams/:id` - Update team
- `DELETE /api/teams/:id` - Delete team
- `GET /api/teams/:teamId/members` - Get members
- `POST /api/teams/:teamId/members` - Add member
- `DELETE /api/teams/:teamId/members/:userId` - Remove member

### Common Failure Modes
- [ ] Team deletion doesn't reassign projects
- [ ] Non-member can add themselves to team

---

## 7. Projects

### Endpoints
- `GET /api/projects` - List projects
- `GET /api/projects/unassigned` - Unassigned projects
- `GET /api/projects/:id` - Get project
- `POST /api/projects` - Create project
- `PATCH /api/projects/:id` - Update project
- `PATCH /api/projects/:projectId/client` - Link/unlink client
- `GET /api/projects/:projectId/sections` - Get sections
- `PATCH /api/projects/:projectId/tasks/reorder` - Reorder tasks

### Components/Pages
- `client/src/pages/project.tsx`
- `client/src/components/create-project-dialog.tsx`
- `client/src/components/project-settings-sheet.tsx`
- `client/src/components/section-column.tsx`

### Common Failure Modes
- [ ] Project visibility not enforced
- [ ] Section ordering breaks with concurrent edits
- [ ] Calendar view missing tasks

---

## 8. Tasks & Subtasks

### Endpoints
- `GET /api/tasks/my` - Get user's tasks
- `GET /api/tasks/:id` - Get task
- `GET /api/tasks/:id/childtasks` - Get child tasks
- `POST /api/tasks` - Create task
- `POST /api/tasks/personal` - Create personal task
- `POST /api/tasks/:taskId/childtasks` - Create child task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/move` - Move task between sections
- `POST /api/tasks/:taskId/assignees` - Add assignee
- `DELETE /api/tasks/:taskId/assignees/:userId` - Remove assignee
- `GET /api/tasks/:taskId/subtasks` - Get subtasks
- `POST /api/tasks/:taskId/subtasks` - Create subtask
- `PATCH /api/subtasks/:id` - Update subtask
- `DELETE /api/subtasks/:id` - Delete subtask
- `POST /api/subtasks/:id/move` - Move subtask

### My Tasks Sections (v1 API)
- `GET /api/v1/my-tasks/sections` - Get personal sections
- `POST /api/v1/my-tasks/sections` - Create section
- `PATCH /api/v1/my-tasks/sections/:id` - Update section
- `DELETE /api/v1/my-tasks/sections/:id` - Delete section
- `POST /api/v1/my-tasks/tasks/:taskId/move` - Move to section

### Components/Pages
- `client/src/pages/my-tasks.tsx`
- `client/src/components/task-detail-drawer.tsx`
- `client/src/components/subtask-list.tsx`
- `client/src/components/subtask-detail-drawer.tsx`
- `client/src/components/task-card.tsx`
- `client/src/components/sortable-task-card.tsx`
- `client/src/components/child-task-list.tsx`
- `client/src/components/create-task-dialog.tsx`
- `client/src/components/task-create-drawer.tsx`

### Common Failure Modes
- [ ] Drag & drop reorder doesn't persist
- [ ] Subtask assignee/due date not saving
- [ ] Personal tasks appear in wrong section
- [ ] Child task ordering breaks

---

## 9. Comments

### Endpoints
- `GET /api/tasks/:taskId/comments` - Get comments
- `POST /api/tasks/:taskId/comments` - Add comment
- `PATCH /api/comments/:id` - Update comment
- `DELETE /api/comments/:id` - Delete comment

### Components
- `client/src/components/comment-thread.tsx`

### Common Failure Modes
- [ ] User can edit others' comments
- [ ] Comment not linked to correct task

---

## 10. Tags

### Endpoints
- `GET /api/workspaces/:workspaceId/tags` - Get tags
- `POST /api/workspaces/:workspaceId/tags` - Create tag
- `PATCH /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag
- `POST /api/tasks/:taskId/tags` - Add tag to task
- `DELETE /api/tasks/:taskId/tags/:tagId` - Remove tag from task

### Components
- `client/src/components/tag-badge.tsx`

### Common Failure Modes
- [ ] Tags from other workspaces visible
- [ ] Duplicate tag names allowed

---

## 11. Time Tracking

### Endpoints (server/routes/timeTracking.ts + routes.ts)
- `GET /api/timer/current` - Get running timer
- `POST /api/timer/start` - Start timer
- `POST /api/timer/pause` - Pause timer
- `POST /api/timer/resume` - Resume timer
- `PATCH /api/timer/current` - Update timer
- `POST /api/timer/stop` - Stop timer
- `DELETE /api/timer/current` - Discard timer
- `GET /api/time-entries` - List entries
- `GET /api/time-entries/my` - My entries
- `GET /api/time-entries/:id` - Get entry
- `POST /api/time-entries` - Create entry
- `PATCH /api/time-entries/:id` - Update entry
- `DELETE /api/time-entries/:id` - Delete entry
- `GET /api/time-entries/report/summary` - Report summary
- `GET /api/time-entries/export/csv` - Export CSV

### Components/Pages
- `client/src/pages/time-tracking.tsx`
- `client/src/components/time-entry-drawer.tsx`

### Common Failure Modes
- [ ] Timer state persists across sessions incorrectly
- [ ] Pause/resume calculates duration wrong
- [ ] Time entries don't filter by date correctly
- [ ] CSV export missing entries

---

## 12. Clients (CRM)

### Endpoints
- `GET /api/clients` - List clients
- `GET /api/clients/:id` - Get client
- `POST /api/clients` - Create client
- `PATCH /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/:clientId/contacts` - Get contacts
- `POST /api/clients/:clientId/contacts` - Add contact
- `PATCH /api/clients/:clientId/contacts/:contactId` - Update contact
- `DELETE /api/clients/:clientId/contacts/:contactId` - Delete contact
- `GET /api/clients/:clientId/invites` - Get invites
- `POST /api/clients/:clientId/invites` - Create invite
- `DELETE /api/clients/:clientId/invites/:inviteId` - Delete invite
- `GET /api/clients/:clientId/projects` - Get projects
- `POST /api/clients/:clientId/projects` - Link project

### Components/Pages
- `client/src/pages/clients.tsx`
- `client/src/pages/client-detail.tsx`
- `client/src/components/client-drawer.tsx`

### Common Failure Modes
- [ ] Client deletion leaves orphaned contacts
- [ ] Client from other tenant visible

---

## 13. File Attachments (S3)

### Endpoints
- `GET /api/attachments/config` - Get upload config
- `GET /api/projects/:projectId/attachments/:id/url` - Get signed URL
- `POST /api/projects/:projectId/attachments` - Upload attachment
- `POST /api/projects/:projectId/attachments/presigned` - Get presigned URL
- `GET /api/projects/:projectId/attachments` - List attachments
- `DELETE /api/projects/:projectId/attachments/:id` - Delete attachment

### Services
- `server/s3.ts` - S3 client and operations
- `server/services/tenantIntegrations.ts` - Tenant S3 config

### Components
- `client/src/components/attachment-uploader.tsx`
- `client/src/components/common/file-dropzone.tsx`

### Common Failure Modes
- [ ] Invalid file type accepted
- [ ] File size limit not enforced
- [ ] S3 credentials not found
- [ ] Signed URL expires too quickly

---

## 14. Email (Mailgun)

### Endpoints
- `GET /api/settings/mailgun` - Get Mailgun settings
- `PUT /api/settings/mailgun` - Update settings
- `POST /api/settings/mailgun/test` - Send test email

### Services
- `server/services/tenantIntegrations.ts` - Mailgun integration

### Common Failure Modes
- [ ] API key not encrypted at rest
- [ ] Test email fails silently
- [ ] Settings not persisted after restart

---

## 15. User Management

### Endpoints
- `GET /api/users` - List users (admin)
- `POST /api/users` - Create user (admin)
- `PATCH /api/users/:id` - Update user (admin)
- `GET /api/invitations` - List invitations (admin)
- `POST /api/invitations` - Create invitation (admin)
- `DELETE /api/invitations/:id` - Delete invitation (admin)
- `POST /api/invitations/for-user` - Generate invite for user
- `PATCH /api/users/me` - Update current user
- `POST /api/v1/me/avatar` - Upload avatar

### Components/Pages
- `client/src/pages/account.tsx`
- `client/src/pages/user-profile.tsx`
- `client/src/components/settings/team-tab.tsx`

### Common Failure Modes
- [ ] Non-admin can access user management
- [ ] User can elevate own role
- [ ] Avatar upload accepts non-image files

---

## 16. Activity Logging

### Endpoints
- `POST /api/activity-log` - Create log entry
- `GET /api/activity-log/:entityType/:entityId` - Get logs for entity

### Common Failure Modes
- [ ] Sensitive data logged
- [ ] Logs not tenant-scoped

---

## 17. Tenancy Health Monitoring

### Endpoints (server/routes/tenancyHealth.ts)
- `GET /api/super/tenancy-health/dashboard`
- `GET /api/super/tenancy-health/warnings`
- `POST /api/super/tenancy-health/backfill`

### Middleware
- `server/middleware/tenancyHealthTracker.ts`

### Common Failure Modes
- [ ] Health data not persisted
- [ ] Non-super user can access health dashboard

---

## 18. Real-time Updates (WebSocket)

### Files
- `server/realtime/index.ts` - Setup
- `server/realtime/socket.ts` - Socket handlers
- `server/realtime/events.ts` - Event emitters

### Common Failure Modes
- [ ] Updates broadcast to wrong tenant
- [ ] Connection not authenticated
- [ ] Events not reaching subscribed clients

---

## 19. Settings & White-Label Branding

### Endpoints
- Via super admin and tenant settings

### Components
- `client/src/pages/settings.tsx`
- `client/src/components/settings/branding-tab.tsx`
- `client/src/components/settings/integrations-tab.tsx`
- `client/src/components/settings/profile-tab.tsx`
- `client/src/components/settings/reports-tab.tsx`
- `client/src/components/settings/team-tab.tsx`
- `client/src/components/settings/tenant-integrations-tab.tsx`
- `client/src/components/settings/workspaces-tab.tsx`

### Common Failure Modes
- [ ] Brand assets not loading
- [ ] Color changes not applied
- [ ] Settings lost on redeploy

---

## Testing Priorities

### Critical Path Tests
1. [ ] User can log in and access their workspace
2. [ ] Tenant isolation prevents cross-tenant access
3. [ ] Super admin can manage tenants
4. [ ] Tasks can be created, updated, and deleted
5. [ ] Time tracking timer persists correctly
6. [ ] File uploads work with S3
7. [ ] Email settings save and send test emails

### Security Tests
1. [ ] Unauthenticated requests return 401
2. [ ] Non-admin cannot access admin routes
3. [ ] Tenant A cannot read Tenant B data
4. [ ] Super routes require super_user role
5. [ ] Passwords are properly hashed
6. [ ] Secrets are not logged or exposed

---

## Audit Progress Tracking

- [ ] Step 1: Audit checklist created
- [ ] Step 2: Endpoint inventory complete
- [ ] Step 3: Middleware order verified
- [ ] Step 4: Input validation standardized
- [ ] Step 5: Error handling standardized
- [ ] Step 6: Large files split
- [ ] Step 7: Code annotations added
- [ ] Step 8: README documentation updated
- [ ] Step 9: Tests added
- [ ] Step 10: Final summary completed
