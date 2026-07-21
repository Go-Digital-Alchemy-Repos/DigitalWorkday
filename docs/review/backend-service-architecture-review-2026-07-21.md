# Backend Service Architecture Review - 2026-07-21

## Executive Assessment

**Overall score:** 7.1 / 10  
**Release recommendation:** Approve with follow-up

### Strongest Aspects

1. **Central route registry exists and is enforceable.** `server/http/mount.ts` registers domain routers with explicit path, policy, domain, and description metadata through `registerRoute`.
2. **Core cross-cutting middleware is centralized.** `server/http/routerFactory.ts` applies policy middleware and the response envelope, while auth/tenant policy names are declared in `server/http/policy/requiredMiddleware.ts`.
3. **High-risk recent portal behavior has focused tests.** Portal login, client invitations, division access, and comment visibility are covered in `server/tests/auth-client-portal-login.test.ts`, `server/tests/client-portal-invites.test.ts`, and `server/tests/customer-access-permissions.test.ts`.

### Most Important Risks

1. **Persistence access is still spread across active routes.** Static inspection found 78 direct `db` imports in active `server/http/domains`, `server/routes`, and `server/features` route areas, so route/controller code still owns some business and persistence decisions.
2. **The legacy storage facade remains a large cross-domain abstraction.** `server/storage.ts` is 4,737 lines while newer repositories under `server/storage/*.repo.ts` coexist with it. This mixed ownership makes transaction boundaries and invariants harder to locate.
3. **External integration adapters are inconsistent.** Mailgun, S3/R2, OpenAI, Stripe, QuickBooks, and Asana calls exist in services and routes. Some adapters are centralized, but route-level integration logic still appears in `server/routes/super/integrations.router.ts`, `server/routes/tenantBilling.ts`, and `server/routes/tenantOnboarding.ts`.

## System Map

### Application and Runtime

- Application type: multi-tenant project/work management SaaS with internal app and customer portal.
- Backend runtime: Node.js, Express 4, TypeScript ESM.
- Package manager: npm.
- Persistence: PostgreSQL through Drizzle ORM, with `shared/schema.ts` as the canonical schema/type source.
- Authentication: Passport local/Google plus `express-session` backed by PostgreSQL session storage.
- Deployment: Railway, configured by `railway.toml`; production start command runs `node server/scripts/deploy-smoke.cjs && npm run start`.
- Build/test stack: `tsx script/build.ts`, `tsc --noEmit`, Vitest, Supertest.

### Execution Flow

1. `server/index.ts` creates the HTTP server, health endpoints, middleware, sessions, Passport, route mounting, static serving, scheduler startup, and shutdown handling.
2. `server/appFactory.ts` builds the Express app for runtime and tests.
3. `server/http/mount.ts` is the current route composition point.
4. `server/http/routerFactory.ts` applies response envelope and route policy middleware.
5. Domain routers call storage/repository/service helpers, Drizzle queries, or external adapters.
6. Cross-cutting auth/tenant helpers live under `server/middleware`, `server/http/policy`, and `server/lib`.

### Boundaries Inspected

- Route registry and policy mounting: `server/http/mount.ts`, `server/http/routeRegistry.ts`, `server/http/routerFactory.ts`.
- Route/controller layer: `server/http/domains/*`, `server/routes/*`, `server/features/*`.
- Service layer: `server/services/*`, `server/reports/*`, `server/features/*/*.service.ts`.
- Repository/data layer: `server/storage.ts`, `server/storage/*.repo.ts`, direct Drizzle imports.
- External adapters: Mailgun, S3/R2, OpenAI, Stripe, QuickBooks, Asana.
- Tests and docs: `server/tests/*`, `docs/architecture/SYSTEM_OVERVIEW.md`, `server/README.md`, prior review docs.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|---|---|---:|---|---|---|---|---|---|---|
| BSA-01 | Medium | Confirmed | Cross-cutting | `server/http/domains/*`, `server/routes/*`, `server/features/*` | Static scan found 78 direct `db` imports in active route areas. Examples include `server/http/domains/access.router.ts`, `server/routes/tenantBilling.ts`, and `server/features/clients/portal.router.ts`. | Routes should orchestrate auth/input/output. Direct Drizzle use in routes makes domain invariants and transaction ownership harder to test and reuse. | Move new and touched business logic into feature services/repositories. Prioritize portal access, billing, super integrations, and CRM conversations. | L | Moderate |
| BSA-02 | Medium | Confirmed | Systemic | `server/storage.ts`, `server/storage/*.repo.ts` | `server/storage.ts` is 4,737 lines while repositories such as `clients.repo.ts`, `tasks.repo.ts`, `chat.repo.ts`, and `notifications.repo.ts` also exist. | Mixed monolith/focused-repository ownership increases the chance that equivalent operations bypass different invariants. | Continue incremental extraction by domain. New writes should go to focused repositories or services, not `server/storage.ts`. | XL | Moderate |
| BSA-03 | Medium | Strongly Supported | Feature-wide | `server/services/tenantIntegrations.ts`, `server/routes/super/integrations.router.ts`, `server/routes/tenantOnboarding.ts`, `server/routes/tenantBilling.ts` | External SDK/client calls are split between services and route modules. Mailgun appears in both tenant integration service and super/tenant route modules; Stripe calls live directly in `tenantBilling.ts`. | Retry policy, timeout behavior, secret handling, and observability become inconsistent when adapters are not owned in one place. | Introduce provider-specific adapters only when touching the feature: `billing.service.ts`, `mailgunIntegration.service.ts`, `quickbooksAuth.service.ts`. | M | Moderate |
| BSA-04 | Low | Confirmed | Local | `server/routes/modules/*/*.router.ts`, `server/routes/modules/index.ts` | 18 inactive module routers contained only `export const xRouter = Router();`; active equivalents live in `server/http/domains/*` or `server/routes/*.router.ts`. | Empty routers looked like production route modules and created false architectural signals for future work. | Removed dead placeholders, retained only the required super-admin compatibility mount, and added a regression test. | XS | Low |
| BSA-05 | Low | Confirmed | Cross-cutting | `server/http/domains/tasks.router.ts`, `server/http/domains/projects.router.ts`, `server/routes/modules/crm/conversations.router.ts` | Largest active routers are 1,530, 1,175, and 1,939 lines respectively. The concern is not line count alone; these files combine validation, authorization, orchestration, persistence, and response mapping. | Large route modules slow safe change because behavior ownership is less obvious. | Split only along behavior boundaries when modifying those features: validation schemas, service orchestration, and repository methods. Avoid standalone cosmetic decomposition. | L | Moderate |
| BSA-06 | Informational | Confirmed | Systemic | `server/http/mount.ts`, `server/http/policy/requiredMiddleware.ts` | Route registry declares per-domain policies, and recent tests assert policy metadata for several routers. | This is a useful architecture direction and should become the enforcement point for future route work. | Add route-registry drift tests for all policy classes before more route migration. | S | Low |

## Changes Made

### Removed inactive module routers

Deleted these no-op placeholder files:

- `server/routes/modules/activity/activity.router.ts`
- `server/routes/modules/attachments/attachments.router.ts`
- `server/routes/modules/clients/clients.router.ts`
- `server/routes/modules/comments/comments.router.ts`
- `server/routes/modules/divisions/divisions.router.ts`
- `server/routes/modules/me/me.router.ts`
- `server/routes/modules/my-tasks/my-tasks.router.ts`
- `server/routes/modules/projects/projects.router.ts`
- `server/routes/modules/sections/sections.router.ts`
- `server/routes/modules/settings/settings.router.ts`
- `server/routes/modules/subtasks/subtasks.router.ts`
- `server/routes/modules/tags/tags.router.ts`
- `server/routes/modules/tasks/tasks.router.ts`
- `server/routes/modules/teams/teams.router.ts`
- `server/routes/modules/time-entries/time-entries.router.ts`
- `server/routes/modules/timer/timer.router.ts`
- `server/routes/modules/users/users.router.ts`
- `server/routes/modules/workspaces/workspaces.router.ts`

### Updated legacy barrel

- `server/routes/modules/index.ts` now documents that active API routes are registered through `server/http/mount.ts`.
- It exports only `searchRouter`, which remains the active mounted module from that barrel path.

### Preserved compatibility mount

- `server/routes/modules/super-admin/tenant-picker.router.ts` remains because `server/routes/superAdmin.ts` imports and mounts `tenantPickerRouter`.
- Added a comment clarifying it is a compatibility mount, not an implementation owner.

### Added regression test

- `server/tests/backend-service-architecture.test.ts` asserts that empty legacy module routers do not reappear.

Compatibility considerations:

- No public route behavior was changed.
- No database schema or migration was changed.
- Super-admin aggregator imports still compile.
- The active route registry and mounted routers are unchanged.

## Verification Results

| Command | Status | Notes |
|---|---|---|
| `npx vitest run server/tests/backend-service-architecture.test.ts` | Pass | New architecture regression test passed. |
| `npm run check` | Pass | TypeScript verified the removed placeholders were not referenced, except the compatibility mount that was restored. |
| `npm test` | Pass | 61 files, 622 tests passed. |
| `npm run test:client` | Pass | 25 files, 157 tests passed. |
| `npm run build` | Pass | Production build completed; existing Browserslist/Tailwind/PostCSS/chunk-size warnings remain. |
| `npm audit --omit=dev` | Pass | 0 vulnerabilities. |
| `git diff --check` | Pass | No whitespace errors. |

## Second Pass

- Re-ran the empty-router scan after remediation. Only `server/routes/modules/super-admin/tenant-picker.router.ts` remains at five lines, and it is intentionally mounted by the super-admin aggregator.
- Confirmed `npm run check` passes after preserving that compatibility route.
- No new database access, public route behavior, middleware ordering, or external adapter path was introduced.
- No Critical or High backend service-architecture findings remain in this pass.

## Residual Risk and Roadmap

### Immediate

1. Keep the route registry as the source of truth for new route work.
2. For every bug fix that touches a route with direct Drizzle calls, move only that touched behavior into a focused service/repository and add route-level regression coverage.
3. Add tests that fail if new active route files are mounted outside `server/http/mount.ts` without policy metadata.

### Near Term

1. Extract billing orchestration from `server/routes/tenantBilling.ts` into a `billing.service.ts` adapter boundary.
2. Consolidate Mailgun test/send/config behavior behind `tenantIntegrationService` or a Mailgun adapter rather than duplicating SDK construction in route modules.
3. Move portal access mutation orchestration in `server/features/clients/portal.router.ts` into a portal access service that owns invite-vs-direct-create behavior.

### Long Term

1. Continue shrinking `server/storage.ts` by domain as features are actively changed.
2. Define transaction ownership rules: routes do not open transactions; services own multi-write domain operations; repositories own single-aggregate persistence.
3. Add a lightweight dependency-direction check once the intended boundaries are stable enough to enforce.

### Do Not Pursue Yet

- Do not rewrite `server/storage.ts` all at once.
- Do not introduce a generic enterprise service framework.
- Do not add broad dependency-injection infrastructure until adapters and repositories have clearer seams from normal feature work.
- Do not split large routers purely by line count; split when there is a tested domain boundary.

## Final Scorecard

| Dimension | Score | Deduction |
|---|---:|---|
| Route/controller boundaries | 7 | Registry is strong, but route files still contain persistence and orchestration logic. |
| Service/domain ownership | 6 | Some good services exist; ownership is inconsistent across older domains. |
| Repository boundaries | 6 | Focused repositories exist alongside a large legacy storage facade. |
| Transaction ownership | 7 | Important flows use transactions, but ownership is inconsistent between routes, services, and repositories. |
| Middleware and auth/tenant policy | 8 | Central policy machinery exists and is improving through tests. |
| External adapter isolation | 6 | Adapters are partially centralized, with remaining route-level SDK usage. |
| Testability | 7 | Strong route/domain tests exist, but direct route persistence reduces isolated unit testability. |
| Operability | 8 | Health checks, deploy smoke, logging, and Railway deployment shape are solid. |
| Maintainability | 7 | Direction is good; legacy dead modules and mixed storage ownership reduce clarity. |
