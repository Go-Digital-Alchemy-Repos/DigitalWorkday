# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application centralizing project and client management to streamline workflows and enhance team collaboration. It offers features like workspaces, tasks, subtasks, tags, comments, activity tracking, and robust reporting. The application supports multi-tenancy, comprehensive CRM with a client portal, and workload management, aiming to improve productivity and client satisfaction through an intuitive user experience.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- **Database migrations**: When pushing schema changes, preserve existing data - only update schema structure, never wipe the database. Use Drizzle migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of `drizzle-kit push` for production deployments.
- Calendar view displays tasks with due dates using FullCalendar, with filtering by client/project/assignee/scope; read-only visualization with task detail drawer on click. Uses lightweight CalendarTask DTO (id, title, status, priority, dueDate, projectId, assignees) for performance - full task data fetched on demand when clicked.
- My Tasks view with two viewing modes: date-based grouping (overdue, today, tomorrow, upcoming) and personal sections organization
- Projects Dashboard with search, status/client/team filters, table view showing project details via drawer, and budget utilization indicators
- Workload Reports in Settings showing task distribution by employee with completion metrics
- Workload Forecast with task time estimates, project budgets, budget tracking, and workload distribution by assignee
- **Global Branding**: Login page and app apply system-level branding configured in Super Admin > System Settings > Global Branding. Resolution chain: tenant settings (logo, favicon, primaryColor, appName) → `system_settings` defaults (`defaultLogoUrl`, `defaultFaviconUrl`, `defaultPrimaryColor`, `defaultAppName`) → hardcoded fallback. Login page applies favicon + primary color CSS variable immediately on load (unauthenticated). Authenticated users via `useTenantTheme()` hook — applies primary color without requiring `whiteLabelEnabled`; secondary/accent colors still gated by `whiteLabelEnabled`. `GET /api/v1/auth/login-branding` and `GET /api/v1/tenant/branding` both merge system + tenant layers.
- **Theme Packs**: 14 curated color schemes (light, dark, midnight, graphite, forest, ocean, violet, rose, amber, slate, sand, arctic, espresso, cyber). Accessible via the sun/moon toggle in the header and the Appearance card in User Profile. Stored in `themePackId` column of `user_ui_preferences` table; `themeMode` kept as legacy-safe "light"/"dark"/"system". Tenant default via `defaultThemePack` in `tenant_settings`. Resolution chain: `themePackId ?? themeMode ?? tenantDefaultThemePack ?? "light"`. Unknown pack IDs safely fall back to "light". Theme packs are defined in `client/src/theme/themePacks.ts`, applied via `ThemeProvider` CSS custom properties.
- **Mobile & Responsiveness (Reports)**: All report pages follow mobile-first responsive patterns. Key standards: (1) **Tables** — all `<Table>` elements are wrapped in `<div className="overflow-x-auto">` to prevent horizontal overflow; wide tables include a mobile hint "Scroll to see all columns"; (2) **Tab navigation** — tab strips on mobile (< 768px) collapse into a `<Select>` dropdown via `MobileTabSelect` component (`client/src/components/reports/mobile-tab-select.tsx`) using CSS-only `md:hidden` / `hidden md:block` pattern — no JS breakpoint detection needed; (3) **Command Centers** — Employee CC and Client CC Overview tables show a mobile card view (`md:hidden`) alongside the desktop table (`hidden md:block`) for optimal readability on small screens; (4) **Container padding** — responsive `p-3 sm:p-4 lg:p-6` throughout all report pages; (5) **Touch targets** — back/action buttons have `min-h-[44px]` on mobile; (6) **Shared utilities** — `useIsMobile` hook at `client/src/hooks/use-is-mobile.ts` (768px threshold, SSR-safe), `MobileTabSelect` component for tab→Select conversion, `ReportCommandCenterLayout` date range selector is `w-full sm:w-44`.

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query, FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query
- **Real-time**: Socket.IO

### Core Features and Design Patterns
- **Multi-Tenancy**: Supports multiple tenants with admin dashboard and per-tenant user management.
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates, supporting tenant-scoped chat, notifications, message editing, and soft delete.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks with subtasks, activity logs, and time tracking. Supports project templates and rich text comments with @mentions.
- **Client Relationship Management (CRM)**: Client detail pages, notes, documents, pipeline tracking, contacts, and an external client portal. Features Client 360 View, profitability reports, and approval workflows.
- **Workload Management**: Provides forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with cursor-based pagination, filters, deep-linking, deduplication, and severity levels.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based accent color theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI.
- **Modular Architecture**: API routes use `createApiRouter` with policy enforcement. Centralized query key builders and role-based frontend routing with lazy-loaded components.
- **Standardized API Error Envelope**: `ApiErrorEnvelope` type for consistent error handling.
- **Tenant Scope Hardening**: `BaseTenantRepository` with `requireTenantId()` and `assertTenantMatch()`, and DB indexes on `tenant_id`.
- **Super Admin Components**: Dedicated architecture for tenant and system status management.
- **Performance & Robustness**: DB performance indexes, optimized React Query, list virtualization, error boundaries, graceful shutdown, route-based code splitting, and telemetry.
- **Security Hardening**: Tenancy enforcement, defense-in-depth tenant scoping, standardized API error handling, rate limiting, CSRF protection, and secret redaction in logs.
- **Background Job Queue**: DB-backed, in-process job queue for long-running operations.
- **Support Ticketing System**: Multi-tenant support ticket and work order system with dual interfaces, CRUD, status transitions, priority management, assignee assignment, and dynamic forms.
- **Email Templates**: Customizable email templates managed via Super Admin, with tenant-first resolution.
- **Reporting Engine V2**: Phased rebuild of the reports system with feature flags, including workload reports, task analysis, time tracking, project analysis, client analytics, messages, pipeline, and overview. Features Employee/Client Command Centers, Employee/Client Health Indexes, Forecasting Layer V1, Forecast Snapshots, Alert Automation, and Weekly Ops Digest.
- **Observability**: Request IDs for correlation, structured logging, error logging to DB, and health endpoints.
- **Asset Library (Beta)**: Centralized asset management with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Documents → Asset Library Unification**: Adapter layer for existing Documents API to use Asset Library with a feature flag.
- **Default Tenant Documents**: Canonical tenant-wide document library managed by Super Admins and Tenant Admins, visible read-only to clients in the Asset Library.
- **Private Visibility (Tasks & Projects)**: Creator-only visibility with invite-based sharing via `task_access` / `project_access` tables. Permissions helpers (`canViewTask`, `canViewProject`) and filtering applied across all list endpoints, search, calendar, dashboard, and client portal.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.