# Dependency Direction and Module Boundaries Audit

Date: 2026-07-20

Scope: Repository-level review of dependency direction, module boundaries, feature entrypoints, shared code gravity, and automated guardrails.

## Executive Assessment

Overall rating: 8/10.

Release recommendation: approve with follow-up.

The project has a reasonably healthy direction-of-dependency posture. Live application code does not show client-to-server or server-to-client import leaks, and the existing HTTP route registry plus policy tests give the backend a useful enforcement point. The main risks are not acute production defects; they are maintainability risks from legacy route locations, broad shared modules, and old feature barrel imports that made frontend chunks less explicit.

This review made one safe remediation pass: client pages now import feature components directly instead of through root feature barrels, and a policy test now guards client/server import direction and feature barrel regressions.

## Strongest Boundary Controls

- `tsconfig.json` and `vite.config.ts` keep the client alias focused on `client/src` while exposing shared code through `@shared`.
- Server route mounting is centralized through `server/http/mount.ts`, and existing route policy tests guard against direct API mounts drifting into unrelated files.
- No live client files were found importing server modules.
- No live server or shared TypeScript files were found importing client modules.
- Domain-specific server tests already exist for route policy and tenant enforcement, which gives future boundary changes a place to attach verification.

## Changes Made

- Replaced root feature barrel imports with direct module imports in these client files:
  - `client/src/components/app-sidebar.tsx`
  - `client/src/components/settings/team-tab.tsx`
  - `client/src/components/super-admin/tenant-drawer.tsx`
  - `client/src/components/tenant-sidebar.tsx`
  - `client/src/pages/chat.tsx`
  - `client/src/pages/client-detail.tsx`
  - `client/src/pages/clients.tsx`
  - `client/src/pages/home.tsx`
  - `client/src/pages/project.tsx`
  - `client/src/pages/projects-dashboard.tsx`
  - `client/src/pages/settings.tsx`
  - `client/src/pages/team-detail.tsx`
- Added `server/tests/policy/moduleBoundary.test.ts` to enforce:
  - server and shared code do not import client modules,
  - client and shared code do not import server modules,
  - client code avoids root `@/features` barrel imports.

## Findings

### MB-01: Root Feature Barrel Imports Coupled Frontend Chunks

Severity: medium.

Status: fixed.

Evidence: client pages imported from root feature entrypoints such as `@/features/chat`, `@/features/projects`, `@/features/clients`, and `@/features/teams`.

Risk: root feature barrels make dependencies less explicit and can pull more code into a route than intended. This is especially risky for large feature areas such as chat, projects, and clients.

Remediation: replaced those imports with direct component, hook, and utility imports. A new policy test blocks regressions.

### MB-02: Direction Rules Were Mostly Conventional, Not Fully Automated

Severity: medium.

Status: fixed.

Evidence: the codebase had strong route policy tests, but no single policy test that failed on client/server import direction drift.

Risk: import direction violations are easy to introduce during feature work and hard to spot in code review once the tree is large.

Remediation: added `server/tests/policy/moduleBoundary.test.ts` with direct `rg` checks over TypeScript and TSX source.

### MB-03: HTTP Registry Still Mounts Legacy Route Modules

Severity: medium.

Status: follow-up recommended.

Evidence: `server/http/mount.ts` imports route modules from `server/routes/*`, including users, CRM, clients, super admin, tenancy, email outbox, webhooks, and dashboard routes. `server/http/domains/system.router.ts` also delegates to `server/routes/systemIntegrations`.

Risk: the route registry is the runtime source of truth, but the physical module layout still mixes legacy route ownership with the newer domain router structure. This makes boundary ownership harder to see.

Recommendation: migrate remaining `server/routes/*` modules into `server/http/domains/*` or feature-owned routers gradually, one route family at a time. Keep mount paths unchanged and run route policy tests after each move.

### MB-04: Shared Schema and Event Modules Are Gravity Centers

Severity: medium.

Status: follow-up recommended.

Evidence: `shared/schema.ts` is 4,328 lines and `shared/events/index.ts` is 1,000 lines.

Risk: these modules are cohesive enough to be useful, but their size raises blast radius. Small changes to one domain can force broad type-checking and review context across unrelated domains.

Recommendation: do not split these during active production stabilization. When the portal and staging work settles, introduce domain-level schema and event modules while preserving current exports for compatibility.

### MB-05: Operational Scripts Import Server Runtime Modules

Severity: low.

Status: acceptable exception.

Evidence: `scripts/verify-indexes.ts` imports `server/db`.

Risk: low. This is an operational script, not browser code or shared runtime code.

Recommendation: document scripts as an allowed exception for server imports. If scripts grow, add a `scripts/README.md` with allowed dependency directions.

### MB-06: Some Feature-to-Feature Imports Are Legitimate but Worth Watching

Severity: low.

Status: follow-up optional.

Evidence: examples include task detail code using the sharing modal, timer code using task selectors, and project detail code using sharing components.

Risk: these are currently reasonable dependencies, but if usage expands, common UI may become better housed under shared client components rather than under one feature's ownership.

Recommendation: leave current behavior unchanged. Promote only stable, cross-feature UI primitives after repeated use is clear.

## Verification

- `git diff --check`: passed.
- `npm run check`: passed.
- `npx vitest run server/tests/policy/moduleBoundary.test.ts`: passed, 3 tests.
- `npm test`: passed, 58 files and 615 tests.
- `npm run test:client`: passed, 20 files and 146 tests.
- `npm run build`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Residual build warnings: existing Browserslist data age warning, Tailwind ambiguous arbitrary variant warnings, PostCSS `from` option warning, and large bundle chunk warnings. None were introduced as failing conditions by this audit.

## Recommended Follow-Up Plan

1. Keep the new module boundary policy test in the standard test suite.
2. Migrate legacy server route modules by route family, starting with low-risk system or dashboard routes.
3. Create a small dependency-direction README for server scripts and one-off operational tooling.
4. Decompose `shared/schema.ts` and `shared/events/index.ts` only after the current customer portal stabilization work is complete.
5. Re-run this audit after each large feature-area refactor so boundary drift is caught while the context is still fresh.
