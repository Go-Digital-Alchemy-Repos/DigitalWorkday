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
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates (chat, notifications).
- **Project & Task Management**: Workspaces, teams, clients, projects, tasks (with subtasks), activity logs, time tracking, project templates, rich text comments.
- **Client Relationship Management (CRM)**: Client detail pages, notes, documents, pipeline tracking, contacts, external client portal with Client 360 View and profitability reports.
- **Workload Management**: Forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with pagination, filters, deep-linking, and severity levels.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based theming, Framer Motion animations, mobile-first responsive design, consistent drawer UI, global search.
- **Modular Architecture**: API routes with policy enforcement, centralized query key builders, role-based frontend routing with lazy-loaded components.
- **Reporting Engine V2**: Rebuilt system with feature flags for workload, task analysis, time tracking, project analysis, client analytics, messages, pipeline, and overview reports. Includes Employee/Client Command Centers, Health Indexes, Forecasting, and Alert Automation.
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication. Includes read-only Default Tenant Documents.
- **Private Visibility (Tasks & Projects)**: Creator-only visibility with invite-based sharing via `task_access`/`project_access` tables, enforced across all list endpoints, search, calendar, dashboard, and client portal.
- **Data Retention System**: Non-destructive soft-archive for tasks and chat messages.
- **Task Review Queue**: "Send to PM for Review" feature from the Task Drawer.
- **Task/Subtask Panel**: Full-width centered Dialog overlay with Overview (description + attachments + comments), History (audit log), Time, and a sidebar for core task details.
- **Task History (Audit Log)**: `task_history` table records field-level changes for tasks and subtasks, displayed as a timeline UI with diffs.
- **Global Branding**: System-level branding configured in Super Admin settings, applied to login page and app, with a resolution chain from tenant settings to system defaults.
- **Theme Packs**: 14 curated color schemes (light, dark, etc.), selectable via UI, stored in user preferences, with tenant default and fallback mechanisms.
- **Employee Intelligence Profile**: Drill-down report page with AI-generated performance trend narrative, based on aggregated metrics, with caching and rate limiting.
- **Client Intelligence Profile**: Drill-down report page with 6-metric summary, workload & aging, time tracking breakdown, SLA compliance, CHI health scores, and risk indicators.
- **Sticky Chat Composer Focus**: Keyboard focus automatically restored to chat input after sending a message across all chat surfaces.
- **Project Milestones**: Track key deliverables within projects with name, description, due date, status, and progress bar from linked tasks. Tasks can be assigned to milestones.
- **Reassignment Suggestions Engine**: Advisory-only, capacity-aware task redistribution system. Identifies overloaded/underutilized users and scores candidate reassignments based on team, utilization, due date, and priority.
- **Capacity What-If Simulator**: In-memory scenario planning for project managers. Allows reassigning tasks, moving due dates, and adjusting estimates virtually to see before/after impact on utilization and project risk. No DB writes during simulation — apply changes only on confirmation. Optional snapshot saving to `forecast_snapshots` table. Accessible via "What-if" button in project toolbar (admin-only, `enableCapacityWhatIf` feature flag).
- **Risk Acknowledgment Workflow (Phase 2C)**: Governance layer for at-risk projects. When a project is `at_risk` or `critical`, a banner appears in the project detail requiring PM or admin acknowledgment within a configurable window (default 7 days). Acknowledgments include a mitigation note and optional next check-in date (suppresses re-prompting until that date). `project_risk_acknowledgments` table stores full audit trail. PM Portfolio shows "Ack Needed" chip for unacknowledged at-risk projects. Feature flag: `enableRiskAckWorkflow` (default ON). Endpoints: `GET/POST /api/projects/:projectId/risk-ack`.
- **PM Portfolio Dashboard**: Portfolio-level intelligence for Project Managers, showing project health scores, milestone completion, burn rates, and overdue tasks for owned projects.
- **Collapsible Icon Sidebar**: Sidebar collapses to an icon-only strip with tooltips for navigation items.
- **Mobile & Responsiveness**: App-wide mobile-first patterns including `overflow-x-auto` for tables, `MobileTabSelect` for tab navigation, mobile card views for Command Centers, responsive padding, and touch targets.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.