# React Rendering and Interaction Performance Audit

Date: 2026-07-20
Reviewer: Codex
Scope: React rendering behavior, provider propagation, large interactive components, list rendering, query/cache behavior, lazy loading, and interaction performance risk.

## Executive Assessment

Overall score: 7/10
Release recommendation: Approve with follow-up

Strongest aspects:
- Route-level code splitting is already in place through `React.lazy()` and `trackChunkLoad()` in `client/src/routing/tenantRouter.tsx`, `client/src/routing/superRouter.tsx`, and `client/src/routing/portalRouter.tsx`.
- The app already has client performance instrumentation in `client/src/lib/perf.ts`, gated by `VITE_CLIENT_PERF_LOG` and `VITE_PERF_TELEMETRY`.
- Expensive optional chat UI is already lazy-loaded. `client/src/pages/chat.tsx` lazy-loads `ChatContextPanel` and `ThreadPanel`; existing docs also record lazy emoji-picker work.

Most important risks:
- App-level context providers included several fresh object/function values, causing avoidable consumer rerenders across the tenant shell, chat drawer, task drawer, reports, auth, and features layers.
- `client/src/pages/chat.tsx` remains a 4,499-line real-time page with message queries, socket subscriptions, optimistic updates, read receipts, file-drop handling, keyboard shortcuts, and layout in one component.
- CRM pages contain repeated client-side filtering/sorting/mapping across large datasets, especially `client/src/pages/clients.tsx`, `client/src/pages/client-360.tsx`, and `client/src/components/client-360-tabs.tsx`; these need runtime measurement before broader memoization.

## System Map

Application type: multi-tenant React/Express project management and client portal app.

Frontend runtime:
- React 18 with Vite.
- Wouter for routing.
- TanStack Query v5 for server state.
- Socket.IO client for real-time events.
- Tailwind/shadcn/Radix for UI.

Primary execution paths inspected:
- App provider stack in `client/src/App.tsx`.
- Tenant shell in `client/src/routing/tenantRouter.tsx`.
- Super-admin shell in `client/src/routing/superRouter.tsx`.
- Context providers in `client/src/lib/auth.tsx`, `client/src/contexts/features-context.tsx`, `client/src/contexts/chat-drawer-context.tsx`, `client/src/contexts/report-context.tsx`, and `client/src/lib/task-drawer-context.tsx`.
- Existing memoized providers in `client/src/hooks/use-presence.tsx`, `client/src/hooks/use-typing.tsx`, `client/src/lib/theme-provider.tsx`, and `client/src/components/ui/sidebar.tsx`.
- Large interactive pages/components, including chat, clients, client 360, notifications, reports, task drawers, and time tracking.

Do-not-change-casually areas:
- Auth/session behavior and redirects.
- Query key contracts and cache invalidation behavior.
- Real-time socket event subscription lifecycle.
- Client portal and tenancy route guards.
- Drizzle schema/migrations and API contracts.

## Findings

| ID | Severity | Confidence | Scope | Location | Evidence | Why it matters | Remediation | Effort | Risk | Verification |
|---|---|---:|---|---|---|---|---|---|---|---|
| RP-01 | Medium | Confirmed | Cross-cutting | `client/src/lib/auth.tsx`, `client/src/contexts/features-context.tsx`, `client/src/contexts/chat-drawer-context.tsx`, `client/src/contexts/report-context.tsx`, `client/src/lib/task-drawer-context.tsx` | Providers passed fresh object literals and, in some cases, fresh functions as context values. Existing peer providers such as presence, typing, theme, and sidebar already use `useMemo`. | Context updates propagate to all consumers by identity. Fresh provider values can rerender consumers when parent/provider state changes but the consumed semantic value is unchanged. | Memoize provider values; wrap auth/report/feature callbacks where needed. | S | Low | Typecheck, client tests, build. |
| RP-02 | Low | Confirmed | Local | `client/src/routing/tenantRouter.tsx` | `TenantLayout` recreated a static `style` object each render and passed it to `SidebarProvider`. | Active timer/mobile/app-mode changes can produce a fresh prop for a stable layout provider. This is small but unnecessary in the always-mounted tenant shell. | Hoist the sidebar CSS variables to a module constant. | XS | Low | Typecheck, client tests, build. |
| RP-03 | Medium | Strongly Supported | Feature-wide | `client/src/pages/chat.tsx` | 4,499-line component; static search found many queries, effects, socket listeners, keyboard listeners, intervals, optimistic update handlers, and large render sections in one route component. | The chat route is real-time and interaction-heavy. Render frequency and commit duration cannot be reliably controlled while subscriptions, derived lists, and layout live in one page shell. | Do not broad-rewrite. Extract hooks around socket subscriptions, conversation selection, message queries, and composer/upload state with React Profiler before/after measurements. | L | Moderate | React Profiler, INP trace, chat regression checklist. |
| RP-04 | Medium | Strongly Supported | Feature-wide | `client/src/pages/clients.tsx`, `client/src/pages/client-360.tsx`, `client/src/components/client-360-tabs.tsx` | Large pages/components with many visible `.filter()`, `.sort()`, `.map()`, and `Set` derivations around client hierarchy, contacts, files, notes, approvals, and staff lists. Some derivations are memoized, but not all table/list work is isolated. | CRM/client portal workflows are data-dense. Recomputing large filtered/sorted sets during search, tab changes, drawer updates, or selection changes can degrade INP. | Add React Profiler traces to clients/360 workflows before adding more memoization. Prefer extracting memoized selectors/hooks around hierarchy grouping and filtered tabs. | M | Moderate | Browser profiling on seeded data, route transition and INP targets. |
| RP-05 | Low | Confirmed | Cross-cutting | `client/src/lib/queryClient.ts`, `docs/05-FRONTEND/PERFORMANCE-CHECKLIST.md` | Query defaults use `staleTime`, `gcTime`, disabled window refetch, and retry filtering. Search found legacy interpolated query-key strings in client 360/team areas. | Query defaults are good. Interpolated first-segment query keys are more of cache invalidation/consistency risk than direct rendering risk, but cache misses can create extra network/refetch churn. | Leave behavior unchanged now. Normalize high-traffic query keys only with targeted tests because invalidation semantics are user-visible. | M | Moderate | Existing query-key regression tests plus targeted route tests. |

## Changes Made

- `client/src/lib/auth.tsx`
  - Added `useMemo` for `AuthContext` value.
  - Wrapped `login` and `logout` in `useCallback`.
  - Preserved auth flow, session redirects, impersonation state, prefetching, and query cache clearing.

- `client/src/contexts/features-context.tsx`
  - Added `useCallback` for `isFeatureEnabled`.
  - Added `useMemo` for `FeaturesContext` value.
  - Preserved feature flag query behavior and one-time fetch gate.

- `client/src/contexts/chat-drawer-context.tsx`
  - Added `useMemo` for drawer context value.
  - Preserved open/close/toggle/thread behavior.

- `client/src/contexts/report-context.tsx`
  - Added `useMemo` for report context value.
  - Wrapped `useReportLink()` return function in `useCallback`.
  - Preserved super-admin report link transformation behavior.

- `client/src/lib/task-drawer-context.tsx`
  - Added `useMemo` for task drawer context value.
  - Preserved task loading, error, and drawer open/close behavior.

- `client/src/routing/tenantRouter.tsx`
  - Hoisted static sidebar style object to `TENANT_SIDEBAR_STYLE`.
  - Preserved sidebar CSS variables and tenant layout behavior.

Compatibility considerations:
- No public API, route, auth permission, database, or deployment behavior changed.
- These are identity-stability changes only; externally observable UI behavior should remain the same.

## Verification Results

Completed:
- `npm run check`: passed.
- `git diff --check`: passed.
- `npm test`: passed, 57 files and 612 tests.
- `npm run test:client`: passed, 20 files and 146 tests.
- `npm run build`: passed. Build retained existing warnings for stale Browserslist data, ambiguous Tailwind arbitrary duration classes, a PostCSS `from` warning, and large chunks.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Known measurement gap:
- Static review and local tests cannot prove INP or commit-duration improvement. The implemented changes remove confirmed unstable identities, but production-grade measurement should use React Profiler and browser performance traces.

## Residual Risk and Roadmap

Immediate:
- Keep provider identity stabilization changes.
- Use `VITE_CLIENT_PERF_LOG=1` locally to capture chunk/navigation timing while testing major routes.
- Profile tenant layout interactions that touch `NotificationCenter`, `GlobalActiveTimer`, `GlobalChatDrawer`, and `TaskDrawerProvider`.

Near-term:
- Profile and split `client/src/pages/chat.tsx` by state boundary: socket subscriptions, message query state, composer/uploads, and active conversation rendering.
- Profile `client/src/pages/clients.tsx` with a large tenant dataset, specifically search/filter/sort and hierarchy grouping.
- Add a small render-count harness for critical providers if React test tooling is expanded.

Long-term:
- Establish measurable targets:
  - Route transition after chunk cache: under 200 ms on target laptops.
  - Chat message send interaction: no visible input stall; INP under 200 ms on seeded data.
  - Clients search/filter interaction: under 100 ms for normal tenant sizes, under 200 ms for large pilot tenants.
  - Avoid unnecessary provider-driven rerenders during active timer ticks and notification socket events.

Recommendations not to pursue now:
- Do not wrap every component in `React.memo`; use profiler evidence first.
- Do not replace TanStack Query cache behavior with local derived stores.
- Do not virtualize chat timeline until scroll anchoring, read receipts, and message jump behavior are measured.
- Do not normalize all query keys in one pass; cache invalidation behavior is broad and user-visible.

## Final Scorecard

Render identity stability: 7/10. Several provider values are now stable; large pages still need measured decomposition.
Interaction responsiveness: 7/10. Existing lazy loading and query defaults help; chat/CRM need profiler-backed work.
Bundle/runtime loading: 8/10. Route splitting and lazy extras are already strong, though build still reports large chunks.
State boundary clarity: 6/10. Context providers are improved, but chat and CRM still mix many responsibilities.
Measurement readiness: 7/10. `client/src/lib/perf.ts` exists, but React commit-frequency/INP targets are not yet automated.
Regression safety: 8/10. Changes are behavior-preserving and locally typechecked; full test/build gates remain required before push.
