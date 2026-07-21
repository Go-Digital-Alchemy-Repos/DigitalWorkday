# Multi-Tenancy and Data-Isolation Audit - 2026-07-21

## Executive Assessment

Overall score: 8/10 after remediation.

Release recommendation: Approve with follow-up.

Strongest aspects:

- Tenant context is centralized in `server/middleware/tenantContext.ts`, with `X-Tenant-Id` only honored for `super_user` actors.
- Route policy metadata is centralized through `server/http/mount.ts`, `server/http/routerFactory.ts`, and `server/http/policy/requiredMiddleware.ts`, with policy drift tests in `server/tests/policy/routePolicy.test.ts`.
- Storage guardrails exist in `server/storage/tenantScoped.ts`, `server/storage/baseTenantRepository.ts`, and client portal access checks in `server/storage.ts`.

Most important risks:

- High, fixed: `authTenant` policy reused `requireTenantContext`, which allowed super users through without an effective tenant. That made the policy weaker than its route-registry contract.
- Medium, follow-up: some client portal helpers still use legacy project lookup helpers after deriving accessible client IDs, rather than tenant-scoped project helpers end to end.
- Medium, follow-up: several tenant-owned schema columns remain nullable for backward compatibility; strict runtime checks mitigate this, but the final not-null migration should wait for a data cleanup/backup window.

## System Map

Digital Workday is an Express + TypeScript application with React/TanStack Query on the frontend and PostgreSQL via Drizzle on the backend. Railway builds with `npm run build`, starts with `node server/scripts/deploy-smoke.cjs && npm run start`, and runs committed migrations at startup when `AUTO_MIGRATE=true`.

Primary tenant flow:

1. Passport/session auth attaches `req.user` in `server/auth.ts`.
2. `tenantContextMiddleware` derives `req.tenant.effectiveTenantId`.
3. `createApiRouter({ policy })` attaches policy middleware.
4. `authTenant` domain handlers call `getEffectiveTenantId(req)` and tenant-scoped storage/query helpers.
5. Super-admin routes use `superUser` policy and explicit tenant params where cross-tenant administration is intended.

Inspected areas:

- Auth and tenant context: `server/auth.ts`, `server/middleware/tenantContext.ts`, `server/middleware/authContext.ts`
- Route policy: `server/http/mount.ts`, `server/http/routerFactory.ts`, `server/http/policy/requiredMiddleware.ts`
- Storage/query layer: `server/storage.ts`, `server/storage/tenantScoped.ts`, `server/storage/baseTenantRepository.ts`, storage repos
- Client portal: `server/features/client-portal/*.ts`, `server/middleware/clientAccess.ts`, `server/services/customerAccessPermissions.ts`
- Realtime: `server/realtime/socketPolicy.ts`
- Webhooks/admin diagnostics/import/export: `server/routes/webhooks.ts`, `server/routes/emailOutbox.ts`, `server/routes/tenancyHealth.ts`, `server/routes/modules/super-admin/*`
- Storage paths: `server/services/uploads/s3UploadService.ts`, `docs/storage/*`
- Tests and docs: tenancy, route policy, portal, chat, upload, CRM, and migration/security docs

## Findings

| ID | Severity | Confidence | Location | Evidence | Why It Matters | Remediation | Effort | Risk | Verification |
|---|---|---|---|---|---|---|---|---|---|
| MT-01 | High | Confirmed | `server/http/policy/requiredMiddleware.ts`, `server/middleware/tenantContext.ts` | `authTenant` policy used `requireTenantContext`; `requireTenantContext` explicitly lets `super_user` pass without `effectiveTenantId`. Existing `server/tests/tenancy-enforcement.test.ts` covered that behavior. | Tenant-scoped routes should not rely on every handler to reject tenantless super-user access. Handlers that fall back to legacy storage paths can become cross-tenant exposure points. | Added `requireExplicitTenantContext` and wired `authTenant` to require an actual effective tenant for super users and regular users. | S | Moderate | `server/tests/policy/requiredMiddleware.test.ts`, route policy tests, tenancy tests, full suite. |
| MT-02 | Medium | Strongly Supported | `server/middleware/clientAccess.ts`, `server/features/client-portal/portal.router.ts` | Portal project checks call `storage.getProject(projectId)` and `storage.getProjectsByClient(clientId)` after deriving accessible client IDs; access validation does check user/client tenant match in `storage.getClientUserAccessByUserAndClient`. | The current path is shielded by access checks, but a tenant-scoped project helper would be more mechanical and easier to audit. | Add `getProjectForPortalUser` / `getProjectsForPortalUserClient` helpers that join through client access and tenant in one query. | M | Moderate | Add cross-tenant portal regression tests with polluted `client_user_access`. |
| MT-03 | Medium | Confirmed | `shared/schema.ts`, `docs/security/tenant-hardening.md`, `server/startup/tenantIdHealthCheck.ts` | Several tenant-owned tables still document nullable `tenantId` for backward compatibility. Strict enforcement blocks many null-tenant reads/writes, and repair tooling exists. | Nullable tenant IDs keep historical-data risk alive until cleanup is complete. | Run tenant-health cleanup, verify zero null/mismatch rows, then plan not-null migrations for core tenant-owned tables. | L | High | Read-only tenant health scan, backup/restore rehearsal, migration smoke tests. |
| MT-04 | Low | Confirmed | `server/realtime/socketPolicy.ts` | Membership cache is per socket and keys by room type/id; socket carries one tenant context. Disconnect cleanup exists. | Current design is tenant-safe; cache invalidation is membership-focused, not tenant-focused. | Keep as-is; add tenant ID to cache key only if sockets can switch tenant without reconnecting. | S | Low | Existing chat socket policy and membership tests. |

## Changes Made

- `server/http/policy/requiredMiddleware.ts`: added `requireExplicitTenantContext` and changed `authTenant` to use it after `requireAuth`.
- `server/tests/policy/requiredMiddleware.test.ts`: added focused coverage for the `authTenant` policy and super-user tenant-selection behavior.
- `docs/review/multi-tenancy-data-isolation-audit-2026-07-21.md`: added this evidence-backed review and roadmap.

Compatibility:

- `requireTenantContext` remains unchanged for legacy/internal call sites that intentionally allow tenantless super users.
- `authOnly`, `superUser`, and `public` route policies are unchanged.
- Super users can still access tenant-scoped routes by selecting a tenant through the existing tenant context mechanism.

## Verification Results

Completed:

- `npx vitest run server/tests/policy/requiredMiddleware.test.ts server/tests/policy/routePolicy.test.ts server/tests/tenancy-enforcement.test.ts` - passed
- `npm run check` - passed
- `npm test` - passed, 65 files / 636 tests
- `npm run test:client` - passed, 25 files / 157 tests
- `npm run build` - passed
- `npm audit --omit=dev` - passed, 0 vulnerabilities
- `git diff --check` - passed

## Residual Risk and Roadmap

Immediate:

1. Keep the `authTenant` explicit-tenant guard in place.
2. Run the tenant and route policy tests whenever route mounts or tenant middleware change.

Near-term:

1. Convert portal project/task lookup helpers to tenant-scoped, access-joined helpers.
2. Add polluted-access-table tests proving portal users cannot see projects when access rows reference clients outside their tenant.
3. Review Railway variables after every deploy and keep `TENANCY_ENFORCEMENT=strict`.

Long-term:

1. Complete null `tenant_id` cleanup and convert core tenant-owned columns to not-null in staged migrations.
2. Consider database-level row-level security only after the application-level isolation model is fully stable and migration risk is understood.
3. Avoid introducing generic tenancy frameworks now; the current explicit route/storage model is understandable and already well-covered by tests.

## Final Scorecard

| Dimension | Score | Deduction |
|---|---:|---|
| Tenant resolution | 8 | Fixed `authTenant` super-user tenantless gap; legacy middleware still allows tenantless super users by design. |
| Route policy enforcement | 9 | Central registry and policy tests are strong. |
| Query/storage isolation | 8 | Tenant-scoped helpers are common; some portal and legacy helpers remain less mechanical. |
| Portal isolation | 7 | Access checks validate tenant match, but project lookup helpers should be tightened. |
| Realtime isolation | 9 | Socket policy requires auth, tenant, and chat membership. |
| Storage-path isolation | 9 | R2 keys are server-generated and tenant namespaced for tenant-owned assets. |
| Admin/tooling exceptions | 8 | Super-admin paths are explicit; diagnostics/export routes should remain closely reviewed. |
| Test coverage | 8 | Broad cross-tenant tests exist; add portal polluted-access regression tests. |
