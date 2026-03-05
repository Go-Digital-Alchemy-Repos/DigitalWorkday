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

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.