# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application providing comprehensive tools for project organization and team collaboration. It supports workspaces, teams, clients (CRM), projects, sections, tasks (with subtasks, tags, comments), and activity tracking. The application aims to streamline project workflows and enhance productivity, offering a robust solution for managing diverse project needs.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- Calendar view displays tasks with due dates using FullCalendar, with filtering and drag-to-reschedule
- My Tasks view with date-based grouping (overdue, today, tomorrow, upcoming)

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query (TanStack Query v5), FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query for server state
- **Real-time**: Socket.IO for live updates across connected clients

### Database Schema
The database schema (`shared/schema.ts`) includes core entities like `users`, `workspaces`, `teams`, `clients`, `projects`, `sections`, `tasks`, `subtasks`, `tags`, `comments`, `activityLog`, `timeEntries`, and `activeTimers`. It also supports multi-tenancy with a `tenants` table and user management features such as `invitations` and `clientUserAccess`.

### Multi-Tenancy
- **tenants** table: Stores tenant organizations with id, name, slug, status (active/inactive)
- All major tables have optional nullable `tenantId` columns for tenant isolation
- **SUPER_USER** role: Can access any tenant via X-Tenant-Id header
- Tenant context middleware (`server/middleware/tenantContext.ts`) provides tenant scoping
- Super Admin API: `/api/v1/super/tenants` for tenant management (CRUD)
- Super Admin UI: `/super-admin` page for managing tenants (visible only to super_user role)
- Backfill script: `server/scripts/backfillTenants.ts` to migrate existing data to default tenant

### Frontend Structure
The frontend (`client/src/`) is organized into `pages/` for route components (e.g., home, my-tasks, project, clients, time-tracking, settings) and `components/` for reusable UI elements. Specialized components exist for settings (team, workspaces, reports, integrations), task management (task-card, task-detail-drawer, section-column, subtask-list, comment-thread, create-task-dialog), and UI elements like badges and avatars. It also features a project calendar (`project-calendar.tsx`) and project settings.

### Backend Structure
The backend (`server/`) is built with modular routes (`routes.ts`, `timeTracking.ts`), a `DatabaseStorage` class for CRUD operations (`storage.ts`), database connection (`db.ts`), authentication setup (`auth.ts`), and real-time infrastructure (`realtime/`). Middleware for error handling (`errorHandler.ts`), request validation (`validate.ts`), and authentication context (`authContext.ts`) is also implemented.

### Authentication & Workspace Resolution
Authentication is session-based using Passport.js. The system resolves the current workspace for authenticated users, storing the `workspaceId` in the session. Production environments enforce `workspaceId` presence, while development allows a fallback.

### Real-time Architecture
Real-time communication uses Socket.IO, with shared event contracts (`shared/events/`) between the server and client. Client-side utilities (`client/src/lib/realtime/`) include a socket singleton and React hooks for subscribing to events (`useProjectSocket`, `useSocketEvent`). Events are emitted by the server after database operations to trigger client-side cache invalidation and refetching for updates.

### Design Guidelines
The application adheres to design guidelines, using the Inter font for UI and JetBrains Mono for monospace. It features a 3-column layout (sidebar, main content, detail drawer) and supports dark mode.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Socket.IO**: Used for real-time communication between the server and connected clients.
- **FullCalendar**: Integrated into the frontend for displaying and managing tasks within a calendar view.
- **Passport.js**: Utilized for session-based authentication (Local Strategy).
- **Railway**: Deployment platform, with automatic PostgreSQL database provisioning and environment variable management.
- **openssl**: Command-line tool used for generating encryption keys for sensitive application settings.