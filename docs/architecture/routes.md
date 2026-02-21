# Route Architecture

## Overview

All API routes are registered and mounted through a centralized system in `server/http/mount.ts`. This ensures consistent policy enforcement, discoverability, and prevents rogue route mounts.

## Architecture

### Route Registry (`server/http/routeRegistry.ts`)

The route registry is the single source of truth for all API routes. Every route mount is tracked with:

- **path**: The Express mount path (e.g., `/api/v1/chat`)
- **router**: The Express Router instance
- **policy**: The authentication/authorization policy (`public`, `authOnly`, `authTenant`, `superUser`)
- **domain**: A unique domain identifier (e.g., `chat`, `users`, `super-admin`)
- **description**: Human-readable description

### Router Factory (`server/http/routerFactory.ts`)

All routers are created using `createApiRouter(options)`:

```ts
import { createApiRouter } from "../http/routerFactory";

const router = createApiRouter({
  policy: "authTenant",     // Required: auth policy
  allowlist: ["/public"],   // Optional: paths exempt from policy
  skipEnvelope: false,      // Optional: skip response envelope
});
```

The factory automatically applies:
1. **Response envelope middleware** — `res.ok()`, `res.fail()`, `res.sendSuccess()`, `res.sendError()`
2. **Policy middleware** — Authentication and tenant context enforcement

### Mount System (`server/http/mount.ts`)

`mountAllRoutes()` is called once during application startup. It:

1. Clears any previous registry
2. Applies global `apiNoCacheMiddleware` to `/api`
3. Registers all domain routes with their metadata
4. Mounts each router to its path via `app.use(path, router)`
5. Starts background notification checkers

### Policies

| Policy | Auth Required | Tenant Required | Use Case |
|--------|:---:|:---:|---|
| `public` | No | No | Webhooks, health checks |
| `authOnly` | Yes | No | Tenant onboarding, billing, cross-tenant routes |
| `authTenant` | Yes | Yes | Most domain routes (tasks, projects, clients) |
| `superUser` | Yes (super) | No | Super admin routes |

## Domain Catalog

### Core Domains (authTenant)

| Domain | Mount Path | Description |
|--------|-----------|-------------|
| tags | /api | Tag CRUD and task-tag associations |
| activity | /api | Activity log CRUD |
| comments | /api | Comment CRUD, resolve/unresolve |
| presence | /api | User presence tracking |
| ai | /api | AI integration routes (OpenAI) |
| attachments | /api | Attachment CRUD, presign, download |
| flags | /api | CRM feature flags |
| time | /api | Time tracking, timers, entries, reporting |
| projects | /api | Projects CRUD, members, sections |
| tasks | /api | Tasks CRUD, assignees, watchers, calendar |
| subtasks | /api | Subtasks CRUD, move, assignees |
| project-notes | /api | Project notes, categories, versions |
| workspaces | /api | Workspace CRUD, members |
| teams | /api | Team CRUD, members |
| users | /api | User management, invitations, preferences |
| crm | /api | CRM: pipeline, metrics, access control |
| clients | /api | Client management, contacts, invites |
| search | /api | Global search for command palette |
| features | /api | Feature modules: notifications, portal, templates |
| jobs | /api | Background job queue |

### Versioned Domains (authTenant)

| Domain | Mount Path | Description |
|--------|-----------|-------------|
| uploads | /api/v1/uploads | File upload: presign, proxy, status |
| chat | /api/v1/chat | Internal chat system |
| workload-reports | /api/v1 | Workload reports and analytics |
| support | /api/v1/support | Support ticket system |
| client-documents | /api/v1 | Document management |
| automation | /api/v1 | Client stage automation |
| assets | /api/v1 | Asset library |
| control-center | /api/v1 | Control center widgets |
| file-serve | /api/v1/files/serve | File serving |
| projects-dashboard | /api/v1 | Project analytics and forecast |
| tenant-data | /api/v1/tenant/data | Import/export, Asana import |

### Super Admin Domains (superUser)

| Domain | Mount Path | Description |
|--------|-----------|-------------|
| system-integrations | /api/v1/system | System integration management |
| super-admin | /api/v1/super | Tenant CRUD, users, settings |
| super-system-status | /api/v1/super | Health, auth diagnostics, DB status |
| super-integrations | /api/v1/super | Mailgun, R2, Stripe config |
| super-chat-export | /api/v1/super/chat | Chat data exports |
| super-debug | /api/v1/super/debug | Debug tools, quarantine, backfill |
| super-debug-chat | /api/v1/super/debug/chat | Chat debug metrics |
| super-chat-monitoring | /api/v1/super/chat | Read-only chat monitoring |

### Auth-Only Domains

| Domain | Mount Path | Policy | Description |
|--------|-----------|--------|-------------|
| tenant-onboarding | /api/v1/tenant | authOnly | Onboarding, settings, branding |
| tenant-billing | /api/v1/tenant | authOnly | Stripe billing, invoices |
| email-outbox | /api/v1 | authOnly | Email logs for tenant and super |
| chat-retention | /api/v1 | authOnly | Retention settings, archive |
| tenancy-health | /api | authOnly | Tenancy integrity checks |
| system-status | /api/v1/super/status | authOnly | Health checks (some public) |

### Public Domains

| Domain | Mount Path | Description |
|--------|-----------|-------------|
| webhooks | /api/v1/webhooks | Stripe webhooks (signature-verified) |

## Guard Exempt Paths

These paths bypass the global auth/tenant guards:

- `/api/auth/*` — Authentication endpoints
- `/api/v1/auth/*` — Versioned auth endpoints
- `/api/v1/super/bootstrap` — Initial super admin setup
- `/api/health` — Health check
- `/api/v1/webhooks/*` — Webhook endpoints
- `/api/v1/tenant/*` — Tenant onboarding

## Testing

### Policy Drift Test

`server/tests/policy/routePolicyDrift.test.ts` ensures:

- Zero legacy routes remain in the registry
- All core domains are registered
- No duplicate path+domain combinations
- All routes have valid policies
- All registered routes have non-null routers
- Super admin routes use `superUser` policy
- Webhook routes use `public` policy

Run: `npx vitest run server/tests/policy/routePolicyDrift.test.ts`

## Adding a New Route

1. Create the router file in `server/http/domains/` using `createApiRouter`:

```ts
import { createApiRouter } from "../routerFactory";

const router = createApiRouter({ policy: "authTenant" });

router.get("/v1/my-domain/items", async (req, res) => {
  // handler
});

export default router;
```

2. Register in `server/http/mount.ts` by adding to `REGISTERED_DOMAINS`:

```ts
{
  path: "/api",
  router: myDomainRouter,
  policy: "authTenant",
  domain: "my-domain",
  description: "My domain description.",
},
```

3. Import the router at the top of mount.ts.

4. Update the policy drift test if adding a new core domain.

## Migration History

All routes were originally in `server/routes/` as plain Express routers with global auth middleware in `server/routes.ts`. They were progressively migrated to the registry-based model:

- Prompts #1-#14: Individual domain migrations (tags, activity, comments, etc.)
- Prompt #3 (Route Consolidation): Final migration of all remaining legacy routes

The legacy `server/routes/` folder is preserved but deprecated. `server/routes.ts` delegates to `mountAllRoutes()` for backward compatibility with test harnesses.
