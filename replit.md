# Digital Workday - Project Management Application

## Overview
Digital Workday is an Asana-inspired, multi-tenant project management application aimed at centralizing project and client management. It streamlines workflows, enhances team collaboration, and improves productivity and client satisfaction through an intuitive user experience. Key capabilities include comprehensive CRM with a client portal, workload management, robust reporting, workspaces, tasks, subtasks, tags, comments, and activity tracking. The project's ambition is to become a leading solution in project and client management by offering a robust, scalable, and user-friendly platform that meets the evolving demands of modern businesses.

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
- **Reporting Engine V2**: Comprehensive reporting system with task analysis, time tracking, project analysis, and financial reports. Includes Employee/Client/Project/Time+Workload Command Centers (with integrated analytics, stage distribution, and pipeline tabs), Health Indexes, Forecasting, and Alert Automation. Overview report removed — KPIs consolidated into Command Centers. Client Pipeline report consolidated as a tab inside Client Command Center. Task Analytics and Project Analysis reports replaced by Project Command Center. Standalone Workload Reports and Time Tracking reports merged into the **Time & Workload Command Center** (`/api/reports/v2/time/*` + `/api/reports/v2/workload/*`) with 5 tabs: Overview (KPI cards + team table), Workload (employee drill-down with trend + top projects), Capacity (weekly heat-map grid), Time (hours by project/user + trend), Risk (flagged employees).
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Private Visibility**: Creator-only visibility for tasks and projects with invite-based sharing.
- **Data Retention**: Non-destructive soft-archive for tasks and chat messages.
- **Task Review Queue**: Feature to send tasks for project manager review.
- **Task History (Audit Log)**: Records field-level changes for tasks and subtasks, displayed as a timeline.
- **Task/Subtask Panel**: Full-width centered overlay with a 2-column layout for details, attachments, comments, and a sidebar for attributes.
- **Global Branding & Theming**: System-level branding with 8 theme packs across 3 categories (Light: Light, Sand; Dark: Dark, Midnight, Graphite, Grey Sky Morning; Funky: The 80's, Hacker). Funky themes support per-theme font overrides (e.g. Orbitron for 80's, Space Mono for Hacker) via `--font-sans` CSS variable token, with automatic reset to Inter when switching away. Sand theme includes a subtle letterpress noise texture overlay via `--texture-opacity`/`--texture-bg` CSS variable tokens. Grey Sky Morning is an ultra-minimal monochrome dark theme with `--icon-saturation: 0` to desaturate all SVG icons. Configurable via Super Admin settings and user preferences.
- **AI Intelligence Profiles**: AI-generated performance trend narratives for employees and 6-metric summaries for clients, based on aggregated metrics.
- **Project Milestones**: Track key deliverables within projects with progress bars linked to tasks.
- **Reassignment Suggestions Engine**: Advisory system for capacity-aware task redistribution.
- **Capacity What-If Simulator**: In-memory scenario planning for project managers to simulate task reassignments and due date changes without database writes until confirmation.
- **Billing Approval Workflow**: Adds `billing_status` to time entries, enabling a workflow for submitting, approving, and rejecting time entries.
- **Invoice Draft Builder**: Allows generating invoice drafts from approved time entries, with options to export and manage drafts.
- **Risk Acknowledgment Workflow**: Governance for at-risk projects, requiring PM or admin acknowledgment with mitigation notes.
- **PM Portfolio Dashboard**: Portfolio-level intelligence for Project Managers with 3-tab layout: **Portfolio** (project table + needs attention), **Billing & Finance** (approval queue, invoice drafts + billable tasks side-by-side, low margin clients), **Insights** (AI focus summary, reassignment suggestions). Summary stats visible above tabs. Tabs conditionally shown based on feature flags. Billable Tasks card shows completed tasks marked `is_billable=true` with title, description, completion date, estimated time, actual logged time, and placeholder "Send to QuickBooks" button.
- **AI PM Focus Summary**: Weekly AI-generated summary of key priorities, risks, and capacity concerns for PMs.
- **Client Profitability Engine**: Calculates client profitability based on time entries, cost rates, and billable rates.
- **Task Billable Toggle**: Boolean `is_billable` on tasks, controllable by authorized roles.
- **QuickBooks Online Integration**: OAuth 2.0 connection to QuickBooks Online for client/customer mapping and billing sync. Features: encrypted token management via `tenant_integrations`, client-to-QBO-customer mapping with manual link/unlink/lock, AI-assisted suggestion engine (weighted name/email/phone matching), customer creation in QBO from DW data, sync status tracking with audit logs. Tables: `quickbooks_customer_mappings`, `quickbooks_sync_logs`. Feature flags: `enableQuickbooksSync`, `enableQuickbooksClientMapping`, `enableQuickbooksCustomerImport`, `enableQuickbooksMappingSuggestions` (all default false). API at `/api/integrations/quickbooks`. Settings tab visible when sync flag enabled. Client detail page shows QB sync card for admin roles. Invoice export blocked for unmapped clients when mapping flag enabled. Requires `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI` env vars.
- **Collapsible Icon Sidebar**: Sidebar collapses to an icon-only strip with tooltips.
- **Mobile & Responsiveness**: App-wide mobile-first patterns including responsive layouts, navigation, and touch targets.
- **Guided Tour / Contextual Help System**: In-app onboarding and help system with full runtime behavior. Frontend module at `client/src/features/guidedTours/` with: type definitions, tour registry (3 production tours), localStorage persistence, GuidedToursContext store (useReducer), `useGuidedTours` hook (with backend sync, route navigation, duplicate-launch guard), `GuidedTourProvider` (wired in App.tsx, gates API calls on auth), `TourStepOverlay` (portal-rendered spotlight + popover, data-testid="tour-step-popover"), `GuidanceCenter` sheet (accessible from user menu "Help & Tours"), `TourLauncher`, `ContextualHint`, and `useTourApi` TanStack Query hooks. `TourStepOverlay` uses `createPortal` to `document.body`, resolves `data-tour` attributes via `waitForTarget()`, renders a spotlight highlight (box-shadow technique) and floating popover card with prev/next/done navigation, repositions on scroll/resize via ResizeObserver. Progress synced to backend via `useCompleteTour`/`useDismissTour`/`useUpdateTourProgress`. Route navigation supported via `requiredRoute` per step. `data-tour` attributes on home.tsx (home-stat-cards, home-focus-tasks, home-upcoming), projects-dashboard.tsx (projects-create-btn, projects-search, projects-filter-bar), my-tasks.tsx (my-tasks-personal-task-btn, my-tasks-search). Backend: `user_guided_tour_preferences` and `user_guided_tour_progress` tables; 7 REST endpoints at `/api/guided-tours/*` (mounted via `guidedTours.router.ts`). Barrel export: `client/src/features/guidedTours/index.ts`.

## Performance Architecture
- **Task List DTOs**: `GET /api/tasks/my?view=list` returns lightweight `TaskListItem` objects (id, title, status, priority, dueDate, counts, assignee names) instead of full `TaskWithRelations`. Full data fetched on-demand when opening task drawer. Controlled by `enableTasksBatchHydration` flag.
- **Batched Task Hydration**: `taskBatchHydrator.ts` fetches all task relations (assignees, watchers, tags, subtasks) in bulk via `IN(taskIds)` queries instead of per-task N+1 loops. `taskListHydrator.ts` does the same for lightweight DTOs.
- **Projects SQL Filtering & Pagination**: `GET /api/projects` supports `?fields=minimal&includeCounts=true&limit=N&offset=N&cursor=X&search=X&status=X&clientId=X&teamId=X&sortBy=X&sortDir=X`. Batched task counts via single `GROUP BY` query. Controlled by `enableProjectsSqlFiltering` flag.
- **Reports Caching**: In-memory LRU cache (`server/lib/reportCache.ts`) with 120s TTL for heavy report endpoints (workload/team, overview, pm/portfolio, task analytics, client analytics). Bypass with `?fresh=true`. Cache headers: `Cache-Control: max-age=60`, `X-Report-Cache: HIT/MISS`.
- **Reports Date Range Limits**: Default 30-day range, max 365 days. Breakdown lists paginated (default top 20, configurable via `limit`/`offset`).
- **Frontend Virtualization**: `react-virtuoso` for large task lists (>20 items). Controlled by `VIRTUALIZATION_V1` feature flag (default: true). Report pages lazy-loaded via `React.lazy`.
- **Response Compression**: `compression` middleware (gzip, threshold 1KB, level 6) enabled for all non-test environments.
- **DB Safety**: Statement timeout (30s default, `DB_STATEMENT_TIMEOUT_MS` env var). Pool: 15 connections in prod, 10 in dev.
- **Observability**: Request logger includes `dbQueryCount` and `dbDurationMs`. Hot-path sampling (1% in prod for notifications, heartbeat, etc.). Slow requests (>800ms) always logged. `perfLoggerMiddleware` samples 5% in prod with 300ms slow threshold. DB pool instrumented via `instrumentDbPool`.
- **Global Search (SQL-first)**: `searchTenantEntities()` in `server/services/search/globalSearchService.ts` runs parallel SQL queries per entity type (clients, projects, tasks, users, teams, comments) with `pg_trgm` GIN trigram indexes for fast `ILIKE` matching. Replaces old broad-fetch + in-memory filter pattern. Visibility filters (`taskVisibilityFilter`/`projectVisibilityFilter`) enforce private task/project access. Comment search uses direct `comments → tasks → projects` JOIN instead of loading all visible task IDs. Prefix matches scored higher. `X-Search-Duration` response header. Slow search logging at >500ms threshold. Frontend: error states, retry=1, previous results kept visible during loading.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.