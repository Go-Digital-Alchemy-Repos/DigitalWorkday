# Code Health and Technical Debt Audit

Date: 2026-07-20
Reviewer: Codex
Scope: dead/stale code, stale TODOs, duplication, long methods/files, logging hygiene, legacy compatibility branches, error handling, testability barriers, and technical debt interest cost.

## Executive Assessment

Overall score: 7/10
Release recommendation: Approve with follow-up

Strongest aspects:
- Runtime route architecture is much healthier than older docs suggest: `server/routes.ts` is an 18-line deprecated marker and `server/routes/superAdmin.ts` is a thin 79-line aggregator.
- Safety rails are good for a production pilot: TypeScript, fast Vitest, client Vitest, production build, route policy tests, security audit, and Railway health checks are part of the working flow.
- Compatibility debt is usually documented and tested rather than hidden. Examples include legacy error shape tests, route policy drift tests, and time-entry/timer legacy tenant handling tests.

Most important risks:
- The storage layer and several high-change UI pages still carry high change friction. `server/storage.ts` is 4,737 lines, `client/src/pages/chat.tsx` is 4,499 lines, and active CRM/client pages exceed 2,300 lines.
- Legacy/null-tenant compatibility remains a real source of complexity in time tracking, projects, tenancy enforcement, and route policy expectations.
- Production browser console noise existed in routine Socket.IO/auth/upload paths; this was low severity, but it made debugging noisier and exposed normal operational details in client consoles.

## System Map

Application type:
- Multi-tenant project management, CRM, time tracking, chat, reporting, and client portal application.

Runtime and framework:
- Node.js + TypeScript monorepo.
- Express backend under `server/`.
- React 18 + Vite frontend under `client/`.
- Wouter client routing.
- TanStack Query v5 server-state cache.
- Socket.IO real-time layer.

Persistence and integrations:
- PostgreSQL with Drizzle ORM; schema contract is centralized in `shared/schema.ts`.
- S3/R2-compatible attachment storage.
- Mailgun/email outbox, Stripe, Google OAuth, OpenAI/AI service hooks.

Deployment:
- Railway production/staging deploy from `main`.
- `npm run build` builds client assets and server bundle to `dist/`.

Major boundaries inspected:
- `client/src/lib/auth.tsx`
- `client/src/lib/realtime/socket.ts`
- `client/src/components/attachment-uploader.tsx`
- `server/http/mount.ts`, `server/http/routerFactory.ts`, `server/http/policy/requiredMiddleware.ts`
- `server/storage.ts`, `server/storage/*.repo.ts`
- `server/http/domains/time/*.routes.ts`, `server/http/domains/projects.router.ts`
- `server/middleware/tenancyEnforcement.ts`, `server/middleware/tenantContext.ts`
- high-line-count files in `client/src/pages`, `client/src/components`, `client/src/features`, `server`, and `shared`
- current review baselines in `docs/review/`

Do-not-change-casually areas:
- Drizzle migrations and snapshots.
- `shared/schema.ts` table/type exports.
- Auth/session flows and agreement enforcement behavior.
- Tenant isolation and legacy tenant-compatibility branches.
- Public route paths and response envelopes.
- Railway configuration and production startup behavior.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Recommended remediation | Effort | Risk | Verification |
|---|---|---:|---|---|---|---|---|---|---|---|
| TD-01 | High | Confirmed | Cross-cutting | `server/storage.ts` | 4,737 lines; contains broad `IStorage` plus implementation covering users, workspaces, teams, projects, tasks, comments, attachments, clients, time, tenants, settings, divisions, support, chat, notifications, and session invalidation. Existing partial repos include `server/storage/chat.repo.ts`, `server/storage/clients.repo.ts`, `server/storage/notifications.repo.ts`, and `server/storage/tasks.repo.ts`. | High change friction and high merge risk. Every storage edit requires navigating unrelated domains, which slows bug fixes and increases accidental coupling. | Continue incremental repository extraction behind the existing `IStorage` facade. Start with users/workspaces/teams or settings because they are important but smaller than task/chat storage. | L | Moderate | Existing fast suite plus focused route/storage tests per extracted domain. |
| TD-02 | High | Confirmed | Feature-wide | `client/src/pages/chat.tsx` | 4,499 lines; includes route state, queries, message state, socket listeners, optimistic updates, read receipts, upload/drop handling, slash commands, keyboard shortcuts, dialogs, and render layout. | Chat has high interaction and support impact. Single-file coupling increases defect interest on every chat or notification change. | Extract hooks by behavior, not by visual region: conversation selection, message queries, socket subscriptions, composer/upload flow, and read receipts. | L | Moderate | Chat tests plus manual send/read/thread/upload regression checklist. |
| TD-03 | Medium | Confirmed | Feature-wide | `client/src/pages/client-detail.tsx`, `client/src/pages/client-360.tsx`, `client/src/components/client-360-tabs.tsx`, `client/src/pages/clients.tsx` | Current line counts: 2,967, 2,630, 2,592, and 2,340. These files are active around portal users, divisions, notes, documents, contacts, and CRM workflows. | Active feature work around customer portal permissions will repeatedly touch these files, creating shotgun-surgery and merge-conflict costs. | Extract tab bodies and data hooks around portal users, division visibility, notes, documents, contacts, and projects. | M-L | Moderate | Client tests and targeted portal/CRM manual regression. |
| TD-04 | Medium | Confirmed | Cross-cutting | `server/http/domains/time/timers.routes.ts`, `server/http/domains/time/entries.routes.ts`, `server/http/domains/projects.router.ts`, `server/middleware/tenancyEnforcement.ts` | Search found explicit legacy/null-tenant branches, warning headers, and tenancy warning logs for timers, time entries, projects, and enforcement. Tests also encode legacy behavior. | Legacy tenant compatibility raises cognitive load and expands test matrix. It may still be required for existing migrated data, so removing it now would be unsafe. | Keep compatibility in place. Add a data-backed retirement plan: count remaining null-tenant rows by table in staging/production, remediate, then remove one branch at a time. | M | High until measured | DB migration/readiness checks and legacy behavior tests. |
| TD-05 | Medium | Confirmed | Local | `client/src/lib/realtime/socket.ts`, `client/src/lib/auth.tsx`, `client/src/components/attachment-uploader.tsx` | Routine browser console logs existed for Socket.IO connect/disconnect/join/leave/ack, auth `/me` non-OK responses, and attachment compression including file names. | Routine logs create debugging noise and expose operational details/file names in normal customer browser consoles. | Gate routine logs behind debug env flags; keep actual warnings/errors visible. Implemented. | XS | Low | Typecheck, client tests, build. |
| TD-06 | Low | Confirmed | Documentation | `docs/01-REFACTOR/GOD_ROUTES_PLAN.md`, `docs/REFACTOR/ROADMAP_BASELINE.md`, `docs/review/oversized-file-audit.md` | Older docs cite `server/routes.ts` and `server/routes/superAdmin.ts` as multi-thousand-line files; current counts are 18 and 79. | Stale historical docs can misdirect refactor planning. | Treat old docs as historical. Keep current review docs under `docs/review/` as active baselines. Optionally add a short superseded banner to older docs. | S | Low | Documentation review. |
| TD-07 | Low | Strongly Supported | Cross-cutting | Client/server console/log searches | Server has structured logger in `server/lib/logger.ts`, but many server modules still use direct `console.log`; client mostly uses errors/warnings after this change, plus explicit perf/debug gates. | Logging style inconsistency slows operations triage and makes log levels harder to tune. | Do not mass-rewrite logs. Convert noisy/high-volume server paths gradually to `createLogger()` when touching those modules. | M | Low-Moderate | Typecheck plus focused smoke tests for touched services. |

## Changes Made

- `client/src/lib/realtime/socket.ts`
  - Added `DEBUG_SOCKET`, enabled by development mode or `VITE_DEBUG_SOCKET=true`.
  - Routed routine connect/disconnect/ack/join/leave/rejoin/ping logs through a gated helper.
  - Kept Socket.IO connection errors and duplicate-handler development warnings visible.

- `client/src/lib/auth.tsx`
  - Added a `DEBUG_AUTH` constant.
  - Reused it for both successful `/api/auth/me` diagnostics and non-OK `/api/auth/me` diagnostics.
  - Preserved actual auth behavior, retry behavior, state clearing, and prefetch behavior.

- `client/src/components/attachment-uploader.tsx`
  - Added `DEBUG_UPLOADS`, enabled by development mode or `VITE_DEBUG_UPLOADS=true`.
  - Gated routine attachment compression logs, including user file names.
  - Preserved image compression/upload behavior.

- `docs/review/code-health-technical-debt-audit-2026-07-20.md`
  - Added this audit and roadmap as a current baseline.

Compatibility considerations:
- No database, route, auth, tenant-permission, or API response behavior changed.
- Debug output can still be enabled locally with `VITE_DEBUG_SOCKET=true`, `VITE_DEBUG_AUTH=true`, or `VITE_DEBUG_UPLOADS=true`.

## Verification Results

Completed:
- `npm run check`: passed.
- `git diff --check`: passed.
- `npm test`: passed, 57 files and 612 tests.
- `npm run test:client`: passed, 20 files and 146 tests.
- `npm run build`: passed. Build retained existing warnings for stale Browserslist data, ambiguous Tailwind arbitrary duration classes, a PostCSS `from` warning, and large chunks.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Remaining gaps:
- No DB-backed legacy-tenant retirement counts were run as part of this local audit.
- No browser console screenshot/trace was taken; the change is statically verifiable by env-gating routine log calls.

## Residual Risk and Roadmap

Highest ROI:
- Continue `server/storage.ts` extraction, one domain at a time behind the existing storage facade.
- Split `client/src/pages/chat.tsx` by behavioral hooks before UI slicing.
- Split CRM/client portal pages around the current product work: portal users, division visibility, comments/notes/documents, and contacts.

Immediate:
- Keep production browser routine logs gated.
- Add current review docs to onboarding/refactor planning instead of older stale refactor baselines.
- Run DB counts for null-tenant legacy rows in staging and production before proposing compatibility removal.

Near-term:
- Convert high-volume server direct logs to `server/lib/logger.ts` in modules already being edited.
- Add a lightweight repository-health script that reports source files above agreed thresholds, stale TODO/FIXME markers, and un-gated browser logs.
- Add focused tests when extracting storage domains so `IStorage` behavior remains stable.

Long-term:
- Retire legacy/null-tenant branches after data remediation proves they are no longer needed.
- Normalize high-traffic query keys only with tests because cache invalidation behavior is user-visible.
- Establish an owner-friendly tech debt register tied to active product areas rather than a generic backlog.

Recommendations not to pursue now:
- Do not rewrite the storage layer wholesale.
- Do not delete legacy tenant compatibility until production data proves it is safe.
- Do not replace all direct server logs in a single churn-heavy PR.
- Do not split `shared/schema.ts` without a Drizzle/migration compatibility plan.
- Do not chase every `console.error`; most remaining client console calls represent genuine failure reporting.

## Final Scorecard

Maintainability: 7/10. Strong route modularization and tests, but storage/chat/CRM files still carry high change cost.
Reliability: 8/10. Existing verification gates are strong; low-risk logging cleanup does not affect runtime behavior.
Security/Privacy: 7/10. Tenant controls are explicit, but legacy branches and routine client logs were debt; client log exposure is reduced.
Developer Experience: 7/10. Current docs and modular route patterns help, but stale docs and large files still slow onboarding.
Operability: 7/10. Structured logger exists, but direct server logs remain inconsistent.
Testability: 7/10. Good fast/client coverage; monolithic storage and chat reduce isolated testing ease.
Debt Interest Trend: 7/10. Recent route and provider work is paying down debt; next wins should target storage and active CRM/client portal surfaces.
