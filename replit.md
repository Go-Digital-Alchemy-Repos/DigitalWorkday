# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It centralizes project and client management, offering tools for organizing projects, teams, and clients with features like workspaces, tasks, subtasks, tags, comments, and activity tracking. The application aims to improve productivity through robust reporting and real-time communication. Key capabilities include multi-tenancy, comprehensive client relationship management (CRM) with a client portal, workload management, and a focus on a professional, intuitive user experience. The business vision is to provide a comprehensive solution that improves project delivery and client satisfaction.

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

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query, FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query
- **Real-time**: Socket.IO

### Core Features and Design Patterns
- **Multi-Tenancy**: Supports multiple tenants with an admin dashboard and per-tenant user management.
- **Authentication**: Session-based authentication using Passport.js (email/password).
- **Real-time Communication**: Socket.IO for live updates, supporting tenant-scoped chat, threaded replies, typing indicators, and notifications.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks with subtasks, activity logs, and time tracking. Supports project templates and rich text comments with @mentions.
- **Client Relationship Management (CRM)**: Comprehensive client detail pages with notes, documents, client pipeline tracking, contacts, and an external client portal. Features Client 360 View, profitability reports, approval workflows, client-safe messaging, and thread merging/duplicate detection for conversations.
- **Workload Management**: Provides workload forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Enhanced Notification Center with cursor-based pagination, filter tabs, dismiss/clear-all functionality, deep-link navigation, deduplication, and severity levels. Supports notification grouping.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based accent color theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI.
- **Modular Architecture**: All API routes use `createApiRouter` with policy enforcement, registered via `server/http/mount.ts` route registry. Centralized query key builders and role-based frontend routing with lazy-loaded components. Storage layer uses domain-specific repositories. Frontend routing decomposed into role-based routers.
- **Standardized API Error Envelope**: `ApiErrorEnvelope` type with `{ success: false, error: { code, message, details? }, requestId }`. `validateBody`/`validateQuery`/`validateParams` middleware for Zod schema validation.
- **Tenant Scope Hardening**: `BaseTenantRepository` abstract class with `requireTenantId()` and `assertTenantMatch()`. DB indexes on `tenant_id` for key tables.
- **Super Admin Components**: Dedicated architecture for super admin functionalities, including tenant management and system status dashboards.
- **Performance & Robustness**: Utilizes DB performance indexes, optimized React Query usage, list virtualization, error boundaries, graceful shutdown, and route-based code splitting. Includes telemetry for performance monitoring.
- **Security Hardening**: Features tenancy enforcement, defense-in-depth tenant scoping, standardized API error handling, rate limiting, CSRF protection, and secret redaction in logs.
- **Background Job Queue**: DB-backed, in-process job queue for long-running operations with concurrency limits and progress tracking.
- **Support Ticketing System**: Multi-tenant support ticket and work order system with dual interfaces (tenant console and client portal), including full CRUD, status transitions, priority management, and assignee assignment.
- **Dynamic Forms**: Category-specific ticket forms using dynamic JSON schemas, allowing custom fields on client portal and detailed views.
- **Chat Enhancements**: Emoji reactions, message editing, and soft delete functionality with audit trails. Single-level message threading.
- **Email Templates**: Customizable email templates managed via Super Admin, with tenant-first resolution. Default templates are seeded on startup.
- **Reporting Engine V2**: Phase-by-phase rebuild of the reports system with feature flags, including workload reports, task analysis, time tracking, project analysis, client analytics, messages, pipeline, and overview.
- **Observability**: Implements request IDs for end-to-end correlation, structured logging, and error logging to the database, along with health endpoints.
- **Asset Library (Beta)**: Centralized asset management system with folders, assets, links, presigned R2 upload/download, source tracking, and deduplication.
- **Documents → Asset Library Unification (Phase 3)**: Adapter layer allowing existing Documents API to use Asset Library infrastructure with a feature flag, providing backward compatibility and migration path.
- **Default Tenant Documents**: Canonical tenant-wide document library managed by Super Admins and Tenant Admins, visible read-only to clients in the Asset Library.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.