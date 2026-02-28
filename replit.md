# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to centralize project and client management. It aims to streamline workflows, enhance team collaboration, and improve productivity and client satisfaction through an intuitive user experience. Key capabilities include multi-tenancy, comprehensive CRM with a client portal, workload management, and robust reporting, featuring workspaces, tasks, subtasks, tags, comments, and activity tracking. The project envisions becoming a leading solution in project and client management by offering a robust, scalable, and user-friendly platform that meets the evolving demands of modern businesses.

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
- **Real-time Communication**: Socket.IO for live updates, supporting tenant-scoped chat, notifications, and message management.
- **Project & Task Management**: Features workspaces, teams, clients, projects, tasks with subtasks, activity logs, and time tracking, including project templates and rich text comments.
- **Client Relationship Management (CRM)**: Includes client detail pages, notes, documents, pipeline tracking, contacts, and an external client portal with a Client 360 View and profitability reports.
- **Workload Management**: Provides forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with pagination, filters, deep-linking, and severity levels.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI. Global Search Bar with debounced queries across various entities, categorized dropdown results, and keyboard navigation.
- **Modular Architecture**: API routes with policy enforcement, centralized query key builders, and role-based frontend routing with lazy-loaded components.
- **Reporting Engine V2**: Rebuilt reporting system with feature flags, including workload, task analysis, time tracking, project analysis, client analytics, messages, pipeline, and overview reports. Features Employee/Client Command Centers, Health Indexes, Forecasting, and Alert Automation.
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Default Tenant Documents**: Canonical tenant-wide document library managed by Super Admins and Tenant Admins, visible read-only to clients in the Asset Library.
- **Private Visibility (Tasks & Projects)**: Creator-only visibility with invite-based sharing via `task_access` / `project_access` tables. Permissions helpers (`canViewTask`, `canViewProject`) and filtering applied across all list endpoints, search, calendar, dashboard, and client portal.
- **Data Retention System**: Non-destructive soft-archive system for tasks and chat messages.
- **Task Review Queue**: "Send to PM for Review" feature accessible from the Task Drawer.
- **Task/Subtask Panel (Redesigned)**: Full-width centered Dialog overlay replacing the old Sheet-based side drawer. Tabs: Overview (description + attachments), Comments, Time (timer + entries), History (audit log). Sidebar: title, status, priority, due date, estimate, watchers, milestone, assignees, tags, subtasks (task) or parent link (subtask).
- **Task History (Audit Log)**: `task_history` table records field-level changes for tasks and subtasks. Frontend: `TaskHistoryTab` component — timeline UI with user avatars, field diffs, timestamps.
- **Global Branding**: Login page and app apply system-level branding configured in Super Admin > System Settings > Global Branding. Resolution chain: tenant settings (logo, favicon, primaryColor, appName) → `system_settings` defaults (`defaultLogoUrl`, `defaultFaviconUrl`, `defaultPrimaryColor`, `defaultAppName`) → hardcoded fallback. Login page applies favicon + primary color CSS variable immediately on load (unauthenticated). Authenticated users via `useTenantTheme()` hook — applies primary color without requiring `whiteLabelEnabled`; secondary/accent colors still gated by `whiteLabelEnabled`. `GET /api/v1/auth/login-branding` and `GET /api/v1/tenant/branding` both merge system + tenant layers.
- **Theme Packs**: 14 curated color schemes (light, dark, midnight, graphite, forest, ocean, violet, rose, amber, slate, sand, arctic, espresso, cyber). Accessible via the sun/moon toggle in the header and the Appearance card in User Profile. Stored in `themePackId` column of `user_ui_preferences` table; `themeMode` kept as legacy-safe "light"/"dark"/"system". Tenant default via `defaultThemePack` in `tenant_settings`. Resolution chain: `themePackId ?? themeMode ?? tenantDefaultThemePack ?? "light"`. Unknown pack IDs safely fall back to "light". Theme packs are defined in `client/src/theme/themePacks.ts`, applied via `ThemeProvider` CSS custom properties.
- **Employee Intelligence Profile**: Drill-down report page at `/reports/employees/:employeeId`. Backend aggregator at `server/reports/employeeProfileAggregator.ts` runs all metric sub-queries in parallel via `Promise.all`. API: `GET /api/reports/v2/employee/:employeeId/profile?range=Xd`. Frontend page `client/src/pages/employee-profile-report.tsx` has date range selector, header card, summary metrics grid, workload/time/capacity/risk/trend sections.
- **Client Intelligence Profile**: Drill-down report page at `/reports/clients/:clientId`. Backend aggregator at `server/reports/clientProfileAggregator.ts` runs all metric sub-queries in parallel via `Promise.all`. API: `GET /api/reports/v2/client/:clientId/profile?range=Xd`. Frontend page `client/src/pages/client-profile-report.tsx` has date range selector, header card, 6-metric summary grid, workload & aging section, time tracking breakdown, SLA compliance visualization, CHI health component scores with tier badge, risk indicators, and top projects table.
- **Employee AI Summary**: AI-generated performance trend narrative card on the Employee Intelligence Profile page. Grounded strictly in aggregated metrics. Architecture: `server/ai/employeeSummary/buildEmployeeSummaryPayload.ts` maps aggregator output to a safe, structured JSON payload; `server/ai/employeeSummary/generateEmployeeSummary.ts` calls the tenant's configured AI provider. Caching: 24-hour TTL rows in `ai_summaries` table (PostgreSQL). Rate limits: in-memory 30/day per tenant, 10/day per user. APIs: `GET /api/v1/ai/employee/:id/summary?days=N` (cache-first) and `POST /api/v1/ai/employee/:id/summary/refresh` (force regenerate). Frontend `AiSummaryCard` component: loading skeleton, structured error states, wins/risks/changes/actions sections, confidence badge, copy-to-clipboard, inline "What is this based on?" dialog, expandable supporting metrics footer, cached indicator.
- **Sticky Chat Composer Focus**: After sending a message, keyboard focus is automatically restored to the chat input textarea across all chat surfaces. Implemented via `useStickyComposerFocus(ref)` hook (`client/src/hooks/useStickyComposerFocus.ts`). Applied to: `global-chat-drawer.tsx`, `chat.tsx`, `features/chat/ThreadPanel.tsx`, and `client-portal-messages.tsx`.
- **Project Milestones**: Track key deliverables and goals within projects. Accessible as a "Milestones" tab on the project board page (`/projects/:id`). Each milestone has: name, optional description, optional due date, status (not_started/in_progress/completed), and real-time progress bar computed from linked tasks. CRUD: create via inline form, inline edit, delete with confirmation dialog. Tasks can be assigned to milestones via a Milestone dropdown in the task detail drawer. Backend: `project_milestones` table in PostgreSQL + `milestone_id` FK on `tasks` table; `milestoneService.ts` with enrichWithStats() parallel query for task counts; REST API at `GET/POST /api/projects/:projectId/milestones`, `PATCH/DELETE /api/milestones/:id`, `PUT /api/projects/:projectId/milestones/reorder`; tenant-scoped. Frontend component: `client/src/features/projects/MilestonesTab.tsx`.
- **Mobile & Responsiveness**: App-wide mobile-first responsive patterns. Key standards: (1) **Tables** — all `<Table>` elements are wrapped in `<div className="overflow-x-auto">`; (2) **Tab navigation** — tab strips on mobile collapse into a `<Select>` dropdown via `MobileTabSelect` component; (3) **Command Centers** — Employee CC and Client CC Overview tables show a mobile card view alongside the desktop table; (4) **Container padding** — responsive `p-3 sm:p-4 lg:p-6` throughout; (5) **Touch targets** — back/action buttons have `min-h-[44px]` on mobile; (6) **Shared utilities** — `useIsMobile` hook (768px threshold, SSR-safe), `MobileTabSelect` component, `ReportCommandCenterLayout` date range selector is `w-full sm:w-44`; (7) **Drawers & Popovers** — Detail drawer uses `w-full sm:max-w-[80vw] sm:min-w-[600px]`; Notification center popover uses `w-[calc(100vw-2rem)] sm:w-[420px]`; (8) **Page headers** — responsive font sizes `text-xl md:text-2xl`, icon sizes `h-7 w-7 md:h-8 md:w-8`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.