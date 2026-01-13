# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application providing comprehensive tools for project organization and team collaboration. It supports workspaces, teams, clients (CRM), projects, sections, tasks (with subtasks, tags, comments), and activity tracking. The application aims to streamline project workflows and enhance productivity, offering a robust solution for managing diverse project needs.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- Calendar view displays tasks with due dates using FullCalendar, with filtering and drag-to-reschedule
- My Tasks view with date-based grouping (overdue, today, tomorrow, upcoming)

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query (TanStack Query v5), FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query for server state
- **Real-time**: Socket.IO for live updates across connected clients

### Database Schema
The database schema (`shared/schema.ts`) includes core entities like `users`, `workspaces`, `teams`, `clients`, `projects`, `sections`, `tasks`, `subtasks`, `tags`, `comments`, `activityLog`, `timeEntries`, and `activeTimers`. It also supports multi-tenancy with a `tenants` table and user management features such as `invitations` and `clientUserAccess`.

### Multi-Tenancy
- **tenants** table: Stores tenant organizations with id, name, slug, status (active/inactive)
- All major tables have optional nullable `tenantId` columns for tenant isolation
- **SUPER_USER** role: Can access any tenant via X-Tenant-Id header
- Tenant context middleware (`server/middleware/tenantContext.ts`) provides tenant scoping
- Super Admin API: `/api/v1/super/tenants` for tenant management (CRUD)
- Super Admin UI: `/super-admin` page for managing tenants (visible only to super_user role)
- Backfill script: `server/scripts/backfillTenants.ts` to migrate existing data to default tenant

### Phase 2A: Tenant Enforcement Infrastructure (Implemented)
- **Global Tenant Middleware**: Applied `requireTenantContext` to all /api routes (except /auth and /health)
  - Non-superusers without tenantId are rejected at middleware level
  - SuperUsers can access without tenant context for backward compatibility
- **Tenant Context Middleware**: Validates X-Tenant-Id headers against active tenants asynchronously
- **Tenant-Scoped Storage Methods**: Added to IStorage interface for:
  - Clients: `getClientByIdAndTenant`, `getClientsByTenant`, `createClientWithTenant`, `updateClientWithTenant`, `deleteClientWithTenant`
  - Projects: `getProjectByIdAndTenant`, `getProjectsByTenant`, `createProjectWithTenant`, `updateProjectWithTenant`
  - Teams: `getTeamByIdAndTenant`, `getTeamsByTenant`, `createTeamWithTenant`, `updateTeamWithTenant`, `deleteTeamWithTenant`
  - Tasks: `getTaskByIdAndTenant`, `createTaskWithTenant`, `updateTaskWithTenant`, `deleteTaskWithTenant`
  - Users: `getUserByIdAndTenant`, `getUsersByTenant`
  - App Settings: `getAppSettingsByTenant`, `setAppSettingsByTenant`
- **Tenant-Scoped Routes**: Updated for clients, projects, teams with FK validation
- **Security Enforcement**: 
  - Only SUPER_USER role can use legacy non-scoped methods (for backward compatibility during migration)
  - Regular users (admin, employee) MUST have tenantId assigned - routes return 500 if missing
  - Cross-tenant data access prevented by tenant-scoped storage methods
- **Bootstrap Changes**: Default admin user upgraded to super_user role for development

### Phase 2B: Tenancy Enforcement Safety Switch (Complete)
- **TENANCY_ENFORCEMENT Environment Variable**: Controls tenant isolation behavior (off|soft|strict)
  - **off**: No enforcement, fully backward compatible (default)
  - **soft**: Logs warnings for tenant violations, adds X-Tenancy-Warn headers for legacy data access
  - **strict**: Blocks cross-tenant access completely
- **Enforcement Utilities** (`server/middleware/tenancyEnforcement.ts`):
  - `getTenancyEnforcementMode()`: Returns current mode from env var
  - `isStrictMode()`, `isSoftMode()`: Mode checks for route-level logic
  - `addTenancyWarningHeader()`: Adds warning headers in soft mode
  - `logTenancyWarning()`: Logs tenant violations for monitoring
  - `validateTenantOwnership()`: Generic resource ownership validation
  - `handleTenancyViolation()`: Returns 403 in strict, logs in soft mode
- **Tenant-Scoped Storage Methods** for Time Tracking:
  - Time Entries: `getTimeEntryByIdAndTenant`, `getTimeEntriesByTenant`, `createTimeEntryWithTenant`, `updateTimeEntryWithTenant`, `deleteTimeEntryWithTenant`
  - Active Timers: `getActiveTimerByIdAndTenant`, `getActiveTimerByUserAndTenant`, `createActiveTimerWithTenant`, `updateActiveTimerWithTenant`, `deleteActiveTimerWithTenant`
  - Task Attachments: `getTaskAttachmentByIdAndTenant`, `getTaskAttachmentsByTaskAndTenant`
- **Updated Routes with Tenant Enforcement** (all use strict/soft/off pattern with full warning instrumentation):
  - Timer routes: GET /api/timer/current, POST /api/timer/start, POST /api/timer/pause, POST /api/timer/resume, PATCH /api/timer/current, POST /api/timer/stop, DELETE /api/timer/current
  - Time-entry routes: GET /api/time-entries, GET /api/time-entries/my, GET /api/time-entries/:id, POST /api/time-entries, PATCH /api/time-entries/:id, DELETE /api/time-entries/:id, GET /api/time-entries/report/summary
- **Soft-Mode Pattern**: All routes follow the pattern:
  - `isStrictMode()`: Only tenant-scoped storage, returns 404 if not found in tenant
  - `isSoftMode()`: Try tenant-scoped first, fallback to legacy with `addTenancyWarningHeader()` + `logTenancyWarning()`
  - Default (off): Legacy storage methods for full backward compatibility

### Phase 2C: Extended Tenant Enforcement (TODO)
- Tasks/Subtasks routes need tenant-scoped storage methods
- Sections, comments, tags routes need tenant-aware lookups
- Client contacts and team members routes need parent resource validation
- Attachment metadata routes need tenant enforcement
- Realtime event scoping for tenant isolation
- Automated tenant isolation tests

### Frontend Structure
The frontend (`client/src/`) is organized into `pages/` for route components (e.g., home, my-tasks, project, clients, time-tracking, settings) and `components/` for reusable UI elements. Specialized components exist for settings (team, workspaces, reports, integrations), task management (task-card, task-detail-drawer, section-column, subtask-list, comment-thread, create-task-dialog), and UI elements like badges and avatars. It also features a project calendar (`project-calendar.tsx`) and project settings.

### Backend Structure
The backend (`server/`) is built with modular routes (`routes.ts`, `timeTracking.ts`), a `DatabaseStorage` class for CRUD operations (`storage.ts`), database connection (`db.ts`), authentication setup (`auth.ts`), and real-time infrastructure (`realtime/`). Middleware for error handling (`errorHandler.ts`), request validation (`validate.ts`), and authentication context (`authContext.ts`) is also implemented.

### Authentication & Workspace Resolution
Authentication is session-based using Passport.js. The system resolves the current workspace for authenticated users, storing the `workspaceId` in the session. Production environments enforce `workspaceId` presence, while development allows a fallback.

### Real-time Architecture
Real-time communication uses Socket.IO, with shared event contracts (`shared/events/`) between the server and client. Client-side utilities (`client/src/lib/realtime/`) include a socket singleton and React hooks for subscribing to events (`useProjectSocket`, `useSocketEvent`). Events are emitted by the server after database operations to trigger client-side cache invalidation and refetching for updates.

### Design Guidelines
The application adheres to design guidelines, using the Inter font for UI and JetBrains Mono for monospace. It features a 3-column layout (sidebar, main content, detail drawer) and supports dark mode.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Socket.IO**: Used for real-time communication between the server and connected clients.
- **FullCalendar**: Integrated into the frontend for displaying and managing tasks within a calendar view.
- **Passport.js**: Utilized for session-based authentication (Local Strategy).
- **Railway**: Deployment platform, with automatic PostgreSQL database provisioning and environment variable management.
- **openssl**: Command-line tool used for generating encryption keys for sensitive application settings.