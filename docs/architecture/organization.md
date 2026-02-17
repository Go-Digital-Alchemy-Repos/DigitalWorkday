# Architecture: Code Organization Conventions

## Directory Structure

```
server/
  http/
    domains/                  # Factory-mounted route modules (new pattern)
      <domain>.router.ts      # Route definitions using createApiRouter()
    mount.ts                  # Single entry point for factory route mounting
    routeRegistry.ts          # Route registry (source of truth)
    routerFactory.ts          # createApiRouter() factory
    policy/
      requiredMiddleware.ts   # Guard policies (public, authOnly, authTenant, superUser)
  routes/
    index.ts                  # Legacy route aggregator (mounts remaining legacy routers)
    <domain>.router.ts        # Legacy route modules (being migrated)
    modules/
      super-admin/            # Super admin sub-routers
      superDebug/             # Debug/diagnostic sub-routers
      crm/                    # CRM domain sub-modules
      search/                 # Search module
  storage/
    index.ts                  # DatabaseStorage class (IStorage implementation)
    <domain>.repo.ts          # Domain-specific repository helpers
  storage.ts                  # IStorage interface definition
  services/
    uploads/                  # Upload/S3 service
    ai/                       # AI provider service
    <domain>.service.ts       # Domain services
  features/
    notifications/            # Notification feature module
  middleware/                 # Express middleware (auth, tenant, rate limiting, etc.)
  realtime/
    socket.ts                 # Socket.IO event handlers
    socketPolicy.ts           # Socket policy wrapper (withSocketPolicy)
    presence.ts               # Presence tracking
    typing.ts                 # Typing indicators
  utils/                      # Shared utilities
  lib/                        # Core library (errors, logging)
  config/                     # Configuration modules

client/
  src/
    pages/                    # Page components (one per route)
    components/
      ui/                     # shadcn/ui primitives
      layout/                 # Layout components (PageContainer, DrawerActionBar)
      richtext/               # TipTap rich text components
      super-admin/            # Super admin UI components
      settings/               # Settings tab components
    hooks/                    # Custom React hooks
    lib/                      # Client utilities (queryClient, utils)

shared/
  schema.ts                   # Drizzle ORM schema + Zod insert schemas
  events.ts                   # Socket.IO event constants
```

## Layering Convention

The target architecture uses this layering:

```
Route (router.ts)
  -> validates request, calls service/storage
  -> thin: only HTTP concerns (parse params, format response)

Service (service.ts) [optional]
  -> orchestrates business logic
  -> side effects (notifications, emails, realtime events)

Storage (IStorage / storage.ts)
  -> data access abstraction
  -> CRUD operations

Repository (repo.ts) [optional]
  -> complex query builders
  -> used by DatabaseStorage
```

### Current State
- Most routes call `storage.*` directly (acceptable for simple CRUD)
- Services exist for cross-cutting concerns (uploads, AI, email, notifications)
- Repositories exist for complex query domains (timeTracking, clients, projects, tasks)
- No strict controller layer; routes handle both HTTP concerns and light business logic

### Guidelines
- New features should extract business logic into services when it involves side effects
- Complex queries should use repository helpers in `server/storage/<domain>.repo.ts`
- Routes should remain thin: parse input, call storage/service, format response
- Shared utilities go in `server/utils/` (e.g., `userDeletion.ts`)

## Route Architecture

### Factory Pattern (Preferred)
New routes use `createApiRouter()` from `server/http/routerFactory.ts`:

```typescript
import { createApiRouter } from "../routerFactory";

const router = createApiRouter();
// Define routes...
export default router;
```

Registered in `server/http/mount.ts` via `registerRoute()`:
```typescript
registerRoute({
  path: "/api",
  router: tagsRouter,
  policy: "authTenant",
  domain: "tags",
  description: "Tag CRUD and task-tag associations.",
  legacy: false,
});
```

### Legacy Pattern (Being Migrated)
Legacy routes use plain `Router()` and are mounted in `server/routes/index.ts`:
```typescript
router.use(clientsRouter);
router.use("/v1/super", superAdminRoutes);
```

### Migration Status
See `docs/architecture/routes.md` for the complete route registry and migration status.

**Migrated domains:** tags, comments, activity, attachments, projects, tasks, subtasks, time, uploads, chat, presence, ai, systemIntegrations, flags

**Legacy domains:** workspaces, teams, users, crm, clients, search, features, superAdmin, tenantOnboarding, tenantBilling, projectsDashboard, workloadReports, emailOutbox, chatRetention, tenancyHealth

## Socket.IO Policy Convention

All socket event handlers MUST be wrapped with `withSocketPolicy()`:

```typescript
socket.on(EVENT_NAME, withSocketPolicy(socket, {
  requireAuth: true,
  requireTenant: true,
  requireChatMembership: false,   // for chat-specific events
  requireChatRoomAccess: false,   // for room access validation
}, async (ctx, payload, socket) => {
  // ctx.userId, ctx.tenantId, ctx.socketId available
}));
```

## Naming Conventions

- **Route files**: `<domain>.router.ts` or `<domain>.ts` (legacy)
- **Service files**: `<domain>.service.ts` or `<domain>Service.ts`
- **Repository files**: `<domain>.repo.ts`
- **Frontend pages**: `<page-name>.tsx` in `client/src/pages/`
- **Shared types**: Defined in `shared/schema.ts` using Drizzle + Zod
- **Event constants**: Defined in `shared/events.ts`

## Performance Conventions

### Backend
- Use batch storage methods for list endpoints (avoid N+1 patterns)
- Available batch methods: `getUsersByIds()`, `getUnreadCountsForChannels()`, `getUnreadCountsForDmThreads()`
- Guard performance logging behind `PERF_LOG` env var

### Frontend
- Wrap sub-components with `React.memo` when they receive props from parent state
- Use `useMemo` for computed/filtered/grouped lists
- Use `useCallback` for callbacks passed to child components
- Move pure utility functions outside component bodies
- Use React Query with appropriate stale times per data type

## Removed Modules

### server/routes/chat.ts (deleted 2026-02-17)
- **Reason**: 1,492-line legacy chat router fully superseded by `server/http/domains/chat.router.ts` (factory-mounted at `/api/v1/chat`).
- **Proof**: Zero imports/requires across the entire codebase. File was marked `@deprecated` since 2026-02-17 and confirmed dead via grep.
- **New location**: `server/http/domains/chat.router.ts` — registered in `server/http/routeRegistry.ts`, mounted via `server/http/mount.ts`.
- **Anti-regression**: Do NOT recreate `server/routes/chat.ts`. All chat route additions go to `server/http/domains/chat.router.ts`.
