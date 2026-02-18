# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It centralizes project and client management, offering tools for organizing projects, teams, and clients with features like workspaces, tasks, subtasks, tags, comments, and activity tracking. The application aims to improve productivity through robust reporting and real-time communication. Key capabilities include multi-tenancy, comprehensive client relationship management (CRM) with a client portal, workload management, and a focus on a professional, intuitive user experience.

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
- **Multi-Tenancy**: Supports multiple tenants with an admin dashboard, white-label branding, and per-tenant user management.
- **Authentication**: Session-based authentication using Passport.js (email/password, Google OAuth).
- **Real-time Communication**: Socket.IO for live updates, supporting tenant-scoped chat, threaded replies, and notifications.
- **Project & Task Management**: Includes workspaces, teams, clients, projects, tasks with subtasks, activity logs, and time tracking. Supports project templates and rich text comments with @mentions.
- **Client Relationship Management (CRM)**: Comprehensive client detail pages with notes, documents (Cloudflare R2), client pipeline tracking, contacts, and an external client portal. Features a Client 360 View, profitability reports, approval workflows, and client-safe messaging. Functionality is controlled by environment-driven feature flags.
- **Workload Management**: Provides workload forecasting and reporting based on task distribution and budget utilization.
- **Notifications**: Customizable, real-time notification system with a Notification Center.
- **User Experience**: Global command palette, keyboard shortcuts, dark mode, CSS-variable-based accent color theming, and Framer Motion animations. Implements mobile-first responsive design and consistent drawer UI.
- **Modular Architecture**: API routes organized by domain via `routeRegistry` + `routerFactory` (migrated) and legacy aggregator. Centralized query key builders in `client/src/lib/queryKeys.ts`. See `docs/architecture/organization.md` for full details.
- **Performance & Robustness**: Utilizes DB performance indexes, optimized React Query usage, list virtualization, error boundaries, and graceful shutdown mechanisms.
- **Security Hardening**: Features tenancy enforcement, defense-in-depth tenant scoping, standardized API error handling, rate limiting on critical endpoints, CSRF protection, and secret redaction in logs.
- **Observability**: Implements request IDs for end-to-end correlation, structured request logging, and error logging to the database. Includes health endpoints for liveness and readiness checks.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar UI component.
- **Passport.js**: Authentication library.
- **Railway**: Deployment platform.
- **Mailgun**: Email service.
- **Cloudflare R2**: Object storage for files.