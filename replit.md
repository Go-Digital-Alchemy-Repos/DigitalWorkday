# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired, multi-tenant project management application aimed at centralizing project and client management. It streamlines workflows, enhances team collaboration, and improves productivity and client satisfaction through an intuitive user experience. Key capabilities include comprehensive CRM with a client portal, workload management, robust reporting, workspaces, tasks, subtasks, tags, comments, and activity tracking. The project's ambition is to become a leading solution in project and client management by offering a robust, scalable, and user-friendly platform that meets the evolving demands of modern businesses.

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
- **Role-Based Access Control**: Hierarchical roles (`super_user` > `tenant_owner` > `admin` > `employee` > `client`) with granular permissions. `isProjectManager` flag grants specific dashboard access.
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks (with subtasks), activity logs, time tracking, and templates.
- **Client Relationship Management (CRM)**: Features client detail pages, notes, documents, pipeline tracking, contacts, and an external client portal with a Client 360 View.
- **Workload Management**: Forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with pagination, filters, and deep-linking.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI.
- **Modular Architecture**: API routes with policy enforcement, centralized query key builders, and role-based frontend routing with lazy-loaded components.
- **Reporting Engine V2**: Comprehensive reporting system with workload, task analysis, time tracking, project analysis, client analytics, and financial reports. Includes Employee/Client Command Centers, Health Indexes, Forecasting, and Alert Automation.
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Private Visibility**: Creator-only visibility for tasks and projects with invite-based sharing.
- **Data Retention**: Non-destructive soft-archive for tasks and chat messages.
- **Task Review Queue**: Feature to send tasks for project manager review.
- **Task History (Audit Log)**: Records field-level changes for tasks and subtasks, displayed as a timeline.
- **Task/Subtask Panel**: Full-width centered overlay with a 2-column layout for details, attachments, comments, and a sidebar for attributes.
- **Global Branding & Theming**: System-level branding and 14 curated theme packs configurable via Super Admin settings and user preferences.
- **AI Intelligence Profiles**: AI-generated performance trend narratives for employees and 6-metric summaries for clients, based on aggregated metrics.
- **Project Milestones**: Track key deliverables within projects with progress bars linked to tasks.
- **Reassignment Suggestions Engine**: Advisory system for capacity-aware task redistribution.
- **Capacity What-If Simulator**: In-memory scenario planning for project managers to simulate task reassignments and due date changes without database writes until confirmation.
- **Billing Approval Workflow**: Adds `billing_status` to time entries, enabling a workflow for submitting, approving, and rejecting time entries.
- **Invoice Draft Builder**: Allows generating invoice drafts from approved time entries, with options to export and manage drafts.
- **Risk Acknowledgment Workflow**: Governance for at-risk projects, requiring PM or admin acknowledgment with mitigation notes.
- **PM Portfolio Dashboard**: Portfolio-level intelligence for Project Managers, showing project health scores, milestone completion, and burn rates.
- **AI PM Focus Summary**: Weekly AI-generated summary of key priorities, risks, and capacity concerns for PMs.
- **Client Profitability Engine**: Calculates client profitability based on time entries, cost rates, and billable rates.
- **Task Billable Toggle**: Boolean `is_billable` on tasks, controllable by authorized roles.
- **Collapsible Icon Sidebar**: Sidebar collapses to an icon-only strip with tooltips.
- **Mobile & Responsiveness**: App-wide mobile-first patterns including responsive layouts, navigation, and touch targets.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.