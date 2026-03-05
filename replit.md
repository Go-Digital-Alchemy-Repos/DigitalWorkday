# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired, multi-tenant project management application designed to centralize project and client management. It aims to streamline workflows, enhance team collaboration, and improve productivity and client satisfaction through an intuitive user experience. Key capabilities include comprehensive CRM with a client portal, workload management, robust reporting, workspaces, tasks, subtasks, tags, comments, and activity tracking. The project envisions becoming a leading solution in project and client management by offering a robust, scalable, and user-friendly platform that meets the evolving demands of modern businesses.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- **Database migrations**: When pushing schema changes, preserve existing data - only update schema structure, never wipe the database. Use Drizzle migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of `drizzle-kit push` for production deployments.
- Calendar view displays tasks with due dates using FullCalendar, with filtering by client/project/assignee/scope; read-only visualization with task detail drawer on click. Uses lightweight CalendarTask DTO (id, title, status, priority, dueDate, projectId, assignees) for performance - full task data fetched on demand when clicked.
- My Tasks view with two viewing modes: date-based grouping (overdue, today, tomorrow, upcoming) and personal sections organization
- Projects Dashboard with search, status/client/team filters, table view showing project details via drawer, and budget utilization indicators
- Workload Reports in Settings showing task distribution by employee with completion metrics
- Workload Forecast with task time estimates, project budgets, budget tracking, and workload distribution by assignee

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query, FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query

### Core Features and Design Patterns
- **Multi-Tenancy**: Supports multiple tenants with an admin dashboard and per-tenant user management.
- **Role Hierarchy & Access Control**: `super_user` > `tenant_owner` > `admin` > `employee` > `client`. All access control is enforced on both backend and frontend.
  - `super_user`: Platform-level admin. Can assign `tenant_owner` role to existing admins. Can set `isProjectManager` on any user.
  - `tenant_owner`: Highest per-tenant role. Has all admin privileges. Always has Project Management dashboard access. Can set `isProjectManager` on `admin` and `tenant_owner` users. Only a `super_user` can grant or revoke this role.
  - `admin`: Standard tenant administrator. Has Project Management dashboard access **only if** `isProjectManager = true`. Cannot self-assign `tenant_owner` or set `isProjectManager` on others.
  - `employee`: Standard user. Never has Project Management dashboard access.
  - `client`: External portal user. Restricted to client-facing views only.
  - **`isProjectManager` flag** (`users.is_project_manager boolean`): Grants `admin` users access to the Project Management dashboard, billing approval workflow, low-margin client reports, and invoice drafts. Set by `tenant_owner` or `super_user` only via PATCH `/api/users/:id`. Included in `/api/auth/me` response. UI: checkbox in User Drawer (visible to tenant_owner/super_user editing admin/tenant_owner users); "PM" badge in team tab.
  - **Backend enforcement**: `requireAdmin` middleware allows `admin` and `tenant_owner`. `requireTenantOwnerOrSuper` is for endpoints restricted to tenant_owner/super_user. PATCH `/api/users/:id` blocks plain admins from setting `isProjectManager` or `tenant_owner` role (403).
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks (with subtasks), activity logs, time tracking, and project templates. Supports private visibility for tasks and projects.
- **Client Relationship Management (CRM)**: Features client detail pages, notes, documents, pipeline tracking, contacts, and an external client portal.
- **Workload Management**: Tools for forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: An enhanced Notification Center with advanced features.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, responsive design, and consistent UI components.
- **Modular Architecture**: API routes with policy enforcement, centralized query key builders, and role-based frontend routing.
- **Reporting Engine V2**: A rebuilt system offering various reports like workload, task analysis, time tracking, project analysis, and client analytics, with Employee/Client Command Centers.
- **Asset Library (Beta)**: Centralized asset management with cloud storage integration, source tracking, and deduplication.
- **Data Retention System**: Non-destructive soft-archive for tasks and chat messages.
- **Task Review Queue**: A feature to send tasks for review to project managers.
- **Task History (Audit Log)**: Records field-level changes for tasks and subtasks, displayed as a timeline.
- **Task/Subtask Panel**: A full-width overlay for detailed task management with a two-column layout and various interactive elements.
- **Global Branding & Theming**: System-level branding configurable by Super Admin, applied across the application, with curated theme packs.
- **AI-Powered Insights**: Employee and Client Intelligence Profiles with AI-generated performance narratives and summaries, including a weekly AI PM Focus Summary.
- **Project Milestones**: Functionality to track key deliverables within projects.
- **Reassignment Suggestions Engine**: An advisory system for capacity-aware task redistribution.
- **Capacity What-If Simulator**: An in-memory tool for project managers to simulate changes and their impact on utilization and risk.
- **Billing Approval Workflow**: A system for managing time entry approval statuses and related actions.
- **Invoice Draft Builder**: A tool to generate, manage, and export invoice drafts from approved time entries.
- **Risk Acknowledgment Workflow**: A governance layer for at-risk projects requiring PM or admin acknowledgment.
- **Project Management Dashboard** (formerly PM Portfolio): Provides portfolio-level intelligence for project managers. UI route: `/project-management` (legacy `/pm-portfolio` redirects here). Accessible to `tenant_owner` and `admin` with `isProjectManager=true`.
- **Multi-PM Projects**: Allows projects to have multiple assigned project managers.
- **Mobile & Responsiveness**: App-wide mobile-first design patterns for optimal mobile user experience.
- **Client Communication Health Engine** (`ENABLE_CLIENT_COMMUNICATION_HEALTH`): Tracks communication recency with clients per project. Adds `last_client_contact_at`, `last_status_report_at`, `next_followup_due_at` columns to the `projects` table. Health rules: 0–7 days → healthy, 7–14 days → warning, 14+ days → stale. Service: `server/services/communication/communicationHealthService.ts`. APIs: `GET /api/projects/:id/communication-health`, `POST /api/projects/:id/client-contact`, `GET /api/communication/health-summary`. Card visible on Project Management dashboard.
- **Client Follow-Up Queue** (`ENABLE_CLIENT_FOLLOWUPS`): Queue of projects needing client follow-up, surfaced in Project Management dashboard. Shows Client, Project, Last Contact, Next Follow-Up, Status, and a "Log Contact" action. Service: `server/services/communication/followUpService.ts`. API: `GET /api/communication/followups`. Card: `data-testid="card-client-followups"`.
- **Google Calendar Follow-Up Integration** (`ENABLE_GOOGLE_CALENDAR_FOLLOWUPS`): Allows PMs to schedule client follow-up reminders directly in Google Calendar from the PM Dashboard. Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env secrets. Per-user OAuth tokens stored in `google_calendar_tokens` table. Service: `server/services/calendarIntegrationService.ts`. Routes: `GET /api/calendar/auth-url`, `GET /api/calendar/callback`, `GET /api/calendar/status`, `POST /api/calendar/events/followup`, `DELETE /api/calendar/disconnect`. UI: "Schedule" button in the Client Follow-Ups table on the PM Dashboard (`data-testid="button-schedule-followup-{projectId}"`); dialog with date/time picker and notes field; connect flow via OAuth redirect. Created event title: "Follow up with [Client] — [Project]", includes project link, 30-minute duration, email+popup reminders. Token refresh handled automatically by googleapis library.
- **Client Communication Timeline** (`ENABLE_COMMUNICATION_TIMELINE`): Non-destructive, additive event log tracking all client-facing communication events per project and client. Table: `client_communication_events` (id, tenant_id, client_id, project_id, event_type, event_description, created_by_user_id, created_at). Event types: `status_report_sent`, `client_contact_logged`, `follow_up_created`, `milestone_update`, `client_email_sent`, `manual_note`. APIs: `GET /api/projects/:id/communication-events`, `POST /api/projects/:id/communication-events`, `GET /api/clients/:clientId/communication-events`. Auto-logged when client contact or status report endpoints are called. UI: "Comms" button (`data-testid="button-project-comms"`) in individual project page header opens a Sheet panel (`data-testid="project-communication-timeline"`); "Communication" section in Client Profile page. Service: `server/services/communication/communicationTimelineService.ts`. Component: `client/src/features/communication/CommunicationTimeline.tsx`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.