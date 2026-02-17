# Route Architecture Convention

> **Status**: Active (Prompt #1 — Feb 2026)  
> **Pilot Domain**: `system-integrations` at `/api/v1/system`

## Overview

All **new routes** must be created using `createApiRouter()` from `server/http/routerFactory.ts` and registered in `server/http/routeRegistry.ts` via `mountAllRoutes()` in `server/http/mount.ts`.

Legacy routes continue to work unchanged. They are inventoried in the route registry for tracking but mounted through the existing `server/routes.ts` aggregator.

## Key Files

| File | Purpose |
|------|---------|
| `server/http/routerFactory.ts` | Factory: creates routers with standardized guard policies |
| `server/http/policy/requiredMiddleware.ts` | Policy definitions: `public`, `authOnly`, `authTenant`, `superUser` |
| `server/http/policy/responseEnvelope.ts` | Non-breaking `res.ok()` / `res.fail()` helpers |
| `server/http/routeRegistry.ts` | Single source of truth for all route mount declarations |
| `server/http/mount.ts` | `mountAllRoutes()` — the single entry point for route registration |
| `server/http/domains/system.router.ts` | Pilot: system-integrations router using new convention |
| `server/tests/policy/routePolicy.test.ts` | Policy drift tests — fail if routes bypass required guards |

## Policies

| Policy | Factory-Applied Guards | Use Case |
|--------|----------------------|----------|
| `public` | None | Health checks, webhooks |
| `authOnly` | `requireAuth` | Tenant onboarding, setup flows |
| `authTenant` | `requireAuth` + `requireTenantContext` | Standard tenant-scoped API routes |
| `superUser` | `requireAuth` + `requireSuperUser` | Admin-only system management |

> **Note**: Request-ID (`X-Request-Id`), request logging, and CSRF middleware are applied **globally** at the app level (in `server/routes.ts`), not by the factory. The factory only applies auth/tenant/superUser guards specific to each policy. During the migration period, factory-mounted routers under `/api/*` also receive the legacy global auth/tenant guards — this is safe (idempotent) but redundant. Once all domains are migrated, the global guards in `routes.ts` will be removed.

## Creating a New Domain Router

```typescript
// server/http/domains/myDomain.router.ts
import { createApiRouter } from "../routerFactory";

const router = createApiRouter({
  policy: "authTenant",          // choose appropriate policy
  allowlist: ["/public-endpoint"], // optional: paths that bypass policy guards
});

// Mount your route handlers
router.get("/items", async (req, res) => {
  const data = await getItems();
  res.ok(data); // uses envelope helper
});

router.post("/items", async (req, res) => {
  // policy guards already applied — user is authenticated + has tenant context
  const item = await createItem(req.body);
  res.ok(item, 201);
});

export default router;
```

Then register in `server/http/mount.ts`:

```typescript
import myDomainRouter from "./domains/myDomain.router";

// Inside mountAllRoutes():
registerRoute({
  path: "/api/v1/my-domain",
  router: myDomainRouter,
  policy: "authTenant",
  domain: "my-domain",
  description: "Description of what this domain handles",
  legacy: false,
});

// Mount it
app.use("/api/v1/my-domain", myDomainRouter);
```

## Response Envelope Helpers

New routes get `res.ok()` and `res.fail()` automatically:

```typescript
// Success
res.ok({ items: [...] });           // 200 by default
res.ok({ id: "abc" }, 201);         // custom status

// Error
res.fail("VALIDATION_ERROR", "Name is required", 400);
res.fail("NOT_FOUND", "Item not found", 404);
res.fail("INTERNAL_ERROR", "Something broke", 500, { debugInfo: "..." });
```

These are **non-breaking additions** — existing `res.json()` / `res.status().json()` patterns continue to work.

## Guard Allowlists

Current auth-exempt paths (defined in `server/routes.ts`):
- `/api/auth/*`
- `/api/v1/auth/*`
- `/api/v1/super/bootstrap`
- `/api/health`
- `/api/v1/webhooks/*`

Current tenant-context-exempt paths:
- `/api/auth/*`
- `/api/health`
- `/api/v1/super/*`
- `/api/v1/tenant/*`
- `/api/v1/webhooks/*`

When a router-factory policy specifies an allowlist, it works at the router level — matching paths within that router that should skip the policy guards.

## Policy Drift Tests

Tests in `server/tests/policy/routePolicy.test.ts` verify:
1. All registered routes have valid policies
2. Webhooks use `public` policy
3. Super admin routes use `superUser` policy
4. Tags domain uses `authTenant` policy
5. Non-legacy routes have actual router instances with factory metadata
6. No rogue `app.use('/api'...)` mounts exist outside allowed files
7. Guard allowlists match the actual exemptions in `routes.ts`

Integration tests in `server/tests/integration/tagsRoutes.test.ts` verify:
1. Unauthenticated requests blocked by factory authTenant policy (401)
2. Authenticated requests reach handlers successfully
3. Missing tenant context blocked (400/403)
4. All tag CRUD routes match correctly (no express-level 404s)
5. Factory metadata present with correct policy

Run: `npx vitest run server/tests/policy/ server/tests/integration/`

## Migrated Domains

| Domain | Mount Path | Policy | Router File | Prompt | Date |
|--------|-----------|--------|-------------|--------|------|
| system-integrations | `/api/v1/system` | `superUser` | `server/http/domains/system.router.ts` | #1 (pilot) | Feb 2026 |
| tags | `/api` | `authTenant` | `server/http/domains/tags.router.ts` | #2 | Feb 2026 |
| activity | `/api` | `authTenant` | `server/http/domains/activity.router.ts` | #3 | Feb 2026 |
| comments | `/api` | `authTenant` | `server/http/domains/comments.router.ts` | #4 | Feb 2026 |
| presence | `/api` | `authTenant` | `server/http/domains/presence.router.ts` | #5 | Feb 2026 |
| ai | `/api` | `authTenant` | `server/http/domains/ai.router.ts` | #5 | Feb 2026 |

### Presence Domain Migration Notes (Prompt #5)
- **1 endpoint** migrated: GET `/v1/presence` (query all or specific user presence)
- **skipEnvelope: true** — Legacy handler uses `res.json()` directly.
- **Path mapping**: Legacy mount was `router.use("/v1/presence", presenceRoutes)` where handler used `/`. New router uses `/v1/presence` path directly, mounted at `/api`.
- **Integration tests**: 5 smoke tests in `server/tests/integration/presenceRoutes.test.ts`.

### AI Domain Migration Notes (Prompt #5)
- **4 endpoints** migrated: GET `/v1/ai/status`, POST `/v1/ai/suggest/task-breakdown`, POST `/v1/ai/suggest/project-plan`, POST `/v1/ai/suggest/task-description`
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Policy: authTenant** — AI features are tenant-scoped. Legacy used `requireAuth` per-handler; factory policy now applies at router scope.
- **Validation preserved**: Zod schemas for request body validation retained verbatim.
- **Integration tests**: 8 smoke tests in `server/tests/integration/aiRoutes.test.ts`.

### Registry-Only Mounting (Prompt #5)
- **mount.ts refactored**: Domain routers are now declared in `MIGRATED_DOMAINS` array and registered via `registerRoute()`. All non-legacy routes are mounted by iterating `getRouteRegistry()` — no direct `app.use(path, router)` calls for individual domains.
- **Policy drift test added**: Verifies mount.ts has no direct `app.use()` calls with router literals, and confirms registry iteration pattern is present.

### Comments Domain Migration Notes (Prompt #4)
- **6 endpoints** migrated: GET/POST `/tasks/:taskId/comments`, PATCH/DELETE `/comments/:id`, POST `/comments/:id/resolve`, POST `/comments/:id/unresolve`
- **Mixed URL prefixes**: Routes span `/tasks/:taskId/comments` and `/comments/:id`. Mounted at `/api` to preserve all paths.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly. Envelope helpers available but not adopted to maintain response compatibility.
- **Notification side-effects preserved**: POST comment handler includes @mention notifications, email outbox, and assignee notifications — all retained verbatim.
- **Integration tests**: 9 smoke tests in `server/tests/integration/commentsRoutes.test.ts` covering auth rejection, tenant enforcement, route matching, and metadata.

### Activity Domain Migration Notes (Prompt #3)
- **2 endpoints** migrated: POST `/activity-log`, GET `/activity-log/:entityType/:entityId`
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Smallest migration**: Only 2 endpoints, no side-effects.

### Tags Domain Migration Notes (Prompt #2)
- **6 endpoints** migrated: tag CRUD (GET, POST, PATCH, DELETE) + task-tag associations (POST, DELETE)
- **Mixed URL prefixes**: Routes span `/workspaces/:id/tags`, `/tags/:id`, and `/tasks/:id/tags`. Mounted at `/api` to preserve all paths.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly. Envelope helpers available but not adopted to maintain response compatibility.
- **Double-guard**: Global auth+tenant from `routes.ts` runs first (idempotent), then factory's `authTenant` policy runs. Safe but redundant.
- **No internal auth guards** — All auth/tenant enforcement came from global middleware, now handled by factory policy.

## Migration Playbook (Next Domain)

To migrate the next domain (Prompt #3):

1. **Pick a domain** from the registry (look for `legacy: true` entries)
2. **Create** `server/http/domains/<domain>.router.ts` using `createApiRouter()`
3. **Move** the route handlers from the legacy router to the new domain file
4. **Comment out** the legacy mount in `routes/index.ts` (add TODO marker)
5. **Register** in `MIGRATED_DOMAINS` array in `mount.ts` — routers are auto-mounted via registry iteration
6. **Add smoke tests** — at least: 401 unauth, 200 auth+tenant, route matching
7. **Update policy drift tests** — verify the new domain's policy is declared
8. **Test** — all tests must pass
9. **Verify** — URLs unchanged, existing behavior preserved

### Recommended migration order (low to high risk):
1. `/api/v1/system` — system integrations (DONE - Prompt #1 pilot)
2. `/api` tags — tag CRUD + task-tag associations (DONE - Prompt #2)
3. `/api` activity — activity log (DONE - Prompt #3)
4. `/api` comments — comment CRUD (DONE - Prompt #4)
5. `/api/v1/presence` — presence tracking (DONE - Prompt #5)
6. `/api/v1/ai` — AI routes (DONE - Prompt #5)
7. `/api` attachments — attachment upload/download (medium)
8. `/api/v1/chat` — chat system (medium, has Socket.IO deps)
9. `/api/v1/uploads` — file uploads (medium, has rate limiting)
10. `/api/v1/super` — super admin (large, many sub-routers)
11. `/api` — remaining main domain routes (largest, final migration)

### Known Risks

- **Double middleware**: Legacy global auth/tenant guards in `routes.ts` apply to ALL `/api/*` paths. New factory-mounted routers under `/api/*` will get both the global guards AND their factory policy guards. Auth checks are idempotent, so this is safe but redundant. Once ALL domains are migrated, remove global guards from `routes.ts`.
- **URL stability**: Never change external URLs during migration. Mount new routers at the exact same paths.
- **Mixed-prefix domains**: Some legacy domains (tags, comments, activity) use routes under multiple URL prefixes (e.g., `/workspaces/:id/tags` AND `/tags/:id`). These must be mounted at `/api` level, not a more specific prefix.
- **Error handler ordering**: Express error middleware must remain LAST. New routers are mounted before error handlers via `mountAllRoutes()`.
- **skipEnvelope for compatibility**: Use `skipEnvelope: true` when migrating handlers that use `res.json()` directly. This preserves response format compatibility. Envelope helpers can be adopted incrementally later.

## Preferred API Version

`/api/v1` is the preferred prefix for new routes. Legacy `/api` prefix exists for backward compatibility.
