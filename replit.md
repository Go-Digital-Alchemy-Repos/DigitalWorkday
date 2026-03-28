# Digital Workday - Project Management Application

## Overview
Digital Workday is an Asana-inspired, multi-tenant project management application designed to centralize project and client management. It aims to streamline workflows, enhance team collaboration, and improve productivity and client satisfaction through an intuitive user experience. Key capabilities include comprehensive CRM with a client portal, workload management, robust reporting, workspaces, tasks, subtasks, tags, comments, and activity tracking. The project's ambition is to become a leading solution in project and client management by offering a robust, scalable, and user-friendly platform that meets the evolving demands of modern businesses.

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
- **Role-Based Access Control**: Hierarchical roles (`super_user` > `tenant_owner` > `admin` > `employee` > `client`) with granular permissions.
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks (with subtasks), activity logs, time tracking, and templates.
- **Client Relationship Management (CRM)**: Features client detail pages, notes, documents, pipeline tracking, contacts, and an external client portal.
- **Workload Management**: Forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with pagination, filters, and deep-linking.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI.
- **Modular Architecture**: API routes with policy enforcement, centralized query key builders, and role-based frontend routing with lazy-loaded components.
- **Reporting Engine V2**: Comprehensive reporting system with task analysis, time tracking, project analysis, and financial reports, consolidated into Employee/Client/Project/Time+Workload Command Centers.
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Private Visibility**: Creator-only visibility for tasks and projects with invite-based sharing.
- **Data Retention**: Non-destructive soft-archive for tasks and chat messages.
- **Task Review Queue**: Feature to send tasks for project manager review.
- **Task History (Audit Log)**: Records field-level changes for tasks and subtasks.
- **Task/Subtask Panel**: Full-width centered overlay with a 2-column layout for details, attachments, comments, and a sidebar for attributes.
- **Global Branding & Theming**: System-level branding with 8 theme packs across 3 categories (Light, Dark, Funky), configurable via Super Admin settings and user preferences. Funky themes support per-theme font overrides and specific visual effects.
- **AI Intelligence Profiles**: AI-generated performance trend narratives for employees and 6-metric summaries for clients.
- **Project Milestones**: Track key deliverables within projects with progress bars linked to tasks.
- **Reassignment Suggestions Engine**: Advisory system for capacity-aware task redistribution.
- **Capacity What-If Simulator**: In-memory scenario planning for project managers to simulate task reassignments and due date changes.
- **Billing Approval Workflow**: Adds `billing_status` to time entries for submission, approval, and rejection.
- **Invoice Draft Builder**: Allows generating invoice drafts from approved time entries.
- **Risk Acknowledgment Workflow**: Governance for at-risk projects, requiring PM or admin acknowledgment with mitigation notes.
- **Super-Admin Tenant Intelligence Layer**: Collapsible panel on Tenant Reports tab showing per-tenant financial summary (revenue/cost/margin from time entries + user rates), composite health score, activity metrics, and cross-tenant platform benchmarks. Backend: `GET /api/v1/super/tenant-intelligence/:tenantId`. Frontend: `TenantIntelligencePanel` component in `super-admin-reports.tsx`.
- **PM Portfolio Dashboard**: Portfolio-level intelligence for Project Managers with tabs for Portfolio, Billing & Finance, and Insights (AI focus summary, reassignment suggestions).
- **AI PM Focus Summary**: Weekly AI-generated summary of key priorities, risks, and capacity concerns for PMs.
- **Client Profitability Engine**: Calculates client profitability based on time entries, cost rates, and billable rates.
- **Task Billable Toggle**: Boolean `is_billable` on tasks, controllable by authorized roles.
- **QuickBooks Online Integration**: OAuth 2.0 connection for client/customer mapping and billing sync.
- **Collapsible Icon Sidebar**: Sidebar collapses to an icon-only strip with tooltips.
- **Mobile & Responsiveness**: App-wide mobile-first patterns.
- **Client Intelligence Profile — Tracked Time Card**: Displays filtered time entries on the Client Intelligence Profile page with Day/Week/Month/Year to Date toggles, showing task title, description, duration, team member, and date with total hours footer.
- **Performance Architecture**: Includes Task List DTOs, Batched Task Hydration, Projects SQL Filtering & Pagination, Reports Caching, Reports Date Range Limits, Frontend Virtualization, Response Compression, DB Safety measures, Observability, and Global Search (SQL-first with trigram indexes). EOD perf pass (2026-03-11): fixed critical N+1 in `getTasksByProject` (300+ → ~8 queries for 50 tasks via batch hydration); parallelized `getTaskWithRelations` serial awaits (7 serial → 2 parallel rounds); parallelized frontend `projectContext` client/division fetches; added DB indexes on `subtasks.assignee_id`, `projects.project_manager_id`, `time_entries(tenant_id, billing_status)`. Remaining hot paths: `getTasksByUser` in workload reports (partially mitigated by Promise.all fix), heavy initial load of drawer secondary data (comments/time entries loaded eagerly).
- **Tenant-Aware Query Cache Keys**: React Query keys are defined in `client/src/lib/queryKeys.ts` and wrapped with `tenantKey()` from `queryClient.ts` for multi-tenant cache isolation. `tenantKey()` prefixes keys with `["tenant", tenantId, ...]` based on the effective tenant ID (set via `setEffectiveTenantId` from auth context and `useAppMode`). Super-scoped keys (`/api/v1/super/*`) bypass the prefix. `clearTenantScopedCaches()` removes both tenant-prefixed and un-migrated inline API keys on tenant switch. `invalidateTaskCaches()` helper consolidates cache invalidation. Inline key migration to `tenantKey()` is incremental.
- **Employee Geolocation Map**: OpenStreetMap-powered map on Super Admin Tenant Reports showing employee locations with opt-in sharing via user profile, marker clustering, and a "no location" sidebar. Only active non-client employees are included. Backend: `GET /api/v1/super/tenants/:tenantId/employee-locations`, `POST/GET /api/v1/me/location`. Frontend: `TeamLocationMap` component, `LocationSharingCard` on user profile.
- **Performance Documentation Library**: Comprehensive docs in `docs/performance/` covering: sprint optimization guide (10 topics with data flow diagrams, tradeoffs, backward compatibility), thin vs full payload strategy, architectural guardrails (7 rules), caching strategy (server TTL + React Query + invalidation), DB indexes, list virtualization, telemetry. Sprint verification report with second-level validation addendum in `docs/sprint-verification-report.md`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.
- **QuickBooks Online**: Accounting software integration.
- **Leaflet / React-Leaflet**: Map rendering for employee geolocation feature.