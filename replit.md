# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It centralizes project and client management, offering tools for organizing projects, teams, and clients with features like workspaces, tasks, subtasks, tags, comments, and activity tracking. The application aims to improve productivity through robust reporting and real-time communication. Key capabilities include multi-tenancy, comprehensive client relationship management (CRM) with a client portal, workload management, and a focus on a professional, intuitive user experience.

## Dev Test Accounts
Three test accounts are available on the login screen (dev mode only, gated by `DEV_AUTO_LOGIN=true`):
- **Super Admin**: admin@myworkday.dev / SuperAdmin123!
- **Tenant Admin**: alex@brightstudio.com / Password123! (Bright Studio owner)
- **Tenant Employee**: mike@brightstudio.com / Password123! (Bright Studio member)

Programmatic access: `GET /api/v1/auth/dev-accounts` (dev mode only, requires `DEV_AUTO_LOGIN=true`)
Programmatic login: `POST /api/auth/login` with `{"email":"...","password":"..."}`

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- **Database migrations**: When pushing schema changes, preserve existing data - only update schema structure, never wipe the database. Use Drizzle migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of `drizzle-kit push` for production deployments.
- Calendar view displays tasks with due dates using FullCalendar, with filtering by client/project/assignee/scope; read-only visualization with task detail drawer on click. Uses lightweight CalendarTask DTO (id, title, status, priority, dueDate, projectId, assignees) for performance - full task data fetched on demand when clicked.
- My Tasks view with two viewing modes: date-based grouping (overdue, today, tomorrow, upcoming) and personal sections organization
- Projects Dashboard with search, status/client/team filters, table view showing project details via drawer, and budget utilization indicators
- Workload Reports in Settings showing task distribution by employee with completion metrics
- Workload Forecast with task time estimates, project budgets, budget tracking, and workload distribution by assignee
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
- **Notifications**: Enhanced Notification Center with cursor-based pagination (useInfiniteQuery), filter tabs (All, Unread, Mentions, Tasks, Chat, Tickets), dismiss/clear-all functionality, deep-link navigation via server-driven `href`, deduplication via `dedupeKey`, severity levels (info/warning/urgent). New notification types: `chat_message`, `client_message`, `support_ticket`, `work_order`. Chat messages and support ticket assignments emit notifications. Preferences include toggles for all new types. **Notification Grouping (V1)**: Slack-like coalescing via `eventCount`, `lastEventAt`, `groupMeta` columns. Server-side window-based deduping with per-type group policies (`notificationGrouping.ts`). Client-side `NotificationGroupRow` component with expand/collapse, group read/dismiss actions. Behind `notificationsGroupingV1` feature flag. GPU-optimized motion: bell-bounce, badge-pop, panel slide, item-enter animations via `motion.css` keyframes and `motion.ts` tokens.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based accent color theming, Framer Motion animations, mobile-first responsive design, and consistent drawer UI.
- **Modular Architecture**: All API routes use `createApiRouter` with policy enforcement (`public`, `authOnly`, `authTenant`, `superUser`), registered via `server/http/mount.ts` route registry. Legacy `server/routes/` folder deprecated — all mounts consolidated in `mount.ts`. Centralized query key builders and role-based frontend routing with lazy-loaded components. Storage layer uses domain-specific repositories. Frontend routing decomposed into role-based routers (`authRouter`, `tenantRouter`, `superRouter`, `portalRouter`) with `withRoleGuard(role)` HOC factory. App.tsx is a thin orchestrator (~100 lines) for providers + role detection + router switch. App factory (`server/appFactory.ts`) centralizes Express app creation for production and tests (no port binding in tests).
- **Standardized API Error Envelope**: `ApiErrorEnvelope` type with `{ success: false, error: { code, message, details? }, requestId }`. `validateBody`/`validateQuery`/`validateParams` middleware for Zod schema validation. Response helpers `res.sendSuccess(data)` / `res.sendError(appError)` on all routers.
- **Tenant Scope Hardening**: `BaseTenantRepository` abstract class with `requireTenantId()` and `assertTenantMatch()`. `TENANCY_ENFORCEMENT` defaults to `strict` in dev, `off` in production. Audit script at `script/auditTenantScope.ts`. DB indexes on `tenant_id` for tasks, projects, time_entries, clients.
- **Super Admin Components**: Dedicated architecture for super admin functionalities, including tenant management and system status dashboards.
- **Performance & Robustness**: Utilizes DB performance indexes, optimized React Query usage, list virtualization, error boundaries, graceful shutdown, and route-based code splitting for significant bundle size reduction. **Telemetry**: Unified `server/lib/perfLogger.ts` with 5% sample rate in production (100% dev); `performance.mark()`/`performance.measure()` on client route transitions (`mwd:nav:*`); stats at `GET /api/v1/system/perf/stats`. **Virtualization**: Client grid/table views use `VirtualizedList` (react-virtuoso) behind `VIRTUALIZATION_V1` feature flag with 20-item threshold; task list views excluded due to DnD constraints. See `docs/performance/telemetry.md` and `docs/performance/virtualization.md`.
- **Security Hardening**: Features tenancy enforcement, defense-in-depth tenant scoping, standardized API error handling, rate limiting, CSRF protection, and secret redaction in logs.
- **Background Job Queue**: DB-backed, in-process job queue for long-running operations (e.g., imports, AI generation) with concurrency limits and progress tracking.
- **Support Ticketing System**: Multi-tenant support ticket and work order system with dual interfaces (tenant console and client portal), including full CRUD, status transitions, priority management, and assignee assignment.
- **Support Tools**: Canned replies and macros for efficient support agent responses, and SLA tracking with escalation for policy adherence.
- **Dynamic Forms**: Category-specific ticket forms using dynamic JSON schemas, allowing custom fields on client portal and detailed views.
- **Chat Enhancements**: Emoji reactions, message editing with a time limit, and soft delete functionality with audit trails. Single-level message threading with a dedicated ThreadPanel drawer.
- **Observability**: Implements request IDs for end-to-end correlation, structured logging, and error logging to the database, along with health endpoints.
- **Asset Library (Beta)**: Centralized asset management system parallel to legacy `client_documents`. Features: `asset_folders`, `assets`, `asset_links` tables; folder tree navigation; presigned R2 upload/download; source tracking (manual, task, comment, etc.); dedupe via r2Key; backfill script for existing attachments. Behind `ASSET_LIBRARY_V2` feature flag. Frontend at `client/src/features/assetLibrary/`. Backend at `server/features/assetLibrary/` with APIs mounted at `/api/v1/assets`.
- **Documents → Asset Library Unification (Phase 3)**: Adapter layer (`server/features/documents/documentsAssetAdapter.ts`) that allows the existing Documents API (`/clients/:clientId/documents/*`) to transparently use Asset Library infrastructure when `DOCUMENTS_USING_ASSETS` feature flag is enabled. Maps Documents response shapes (originalFileName, displayName, fileSizeBytes, storageKey) to Asset Library fields (title, sizeBytes, r2Key). Provides backward-compatible migration path from `client_documents` table to unified `assets` system. Backfill script at `server/scripts/backfillDocumentsToAssets.ts` (supports `--dry-run`). Feature flags: `DOCUMENTS_USING_ASSETS` in `server/config.ts`, exposed via `/api/features/flags`, consumed by `useFeatureFlags()` hook.
- **Default Tenant Documents**: Canonical tenant-wide document library managed by Super Admins and Tenant Admins, visible read-only to all clients in the Asset Library. Tables: `tenant_default_folders` (hierarchical folders with soft delete), `tenant_default_documents` (files stored in R2 with versioning, soft delete). Backend: `server/features/tenantDefaultDocs/tenantDefaultDocs.repo.ts` (repository), `server/http/domains/tenantDefaultDocs.router.ts` (API router). API mounted at `/api/v1/tenants/:tenantId/default-docs/*` with admin/super auth guards; client-facing read endpoint at `/client-view`. Frontend: `client/src/features/tenantDefaultDocs/DefaultTenantDocumentsManager.tsx` (shared manager component). UI locations: Super Admin tenant drawer "Defaults" tab, Tenant Admin Settings "Default Docs" tab. Client integration: read-only "Tenant Defaults" section at root of Asset Library with "Default" badges. Feature flag: `tenantDefaultDocs` (defaults to true). Migration: `0041_nasty_enchantress.sql`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.