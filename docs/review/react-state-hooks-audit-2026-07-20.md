# React State, Hooks, and Data-Flow Audit

Date: 2026-07-20

Scope: Client-side React state ownership, hooks, effects, server state, optimistic updates, subscriptions, context shape, stale closures, and cleanup behavior.

## Executive Assessment

Overall score: 7/10.

Release recommendation: approve with follow-up.

The client has a workable state model: server state is primarily owned by React Query, query keys follow array-segment conventions, context values are generally memoized, and socket/event subscriptions mostly live in hooks or concentrated realtime surfaces. The main risks are stateful page size and long-lived effects in the largest workflows, especially chat, client 360, time tracking, task detail, and super-admin screens.

This review fixed a confirmed cleanup issue in `useAppMode`: async tenant validation and transition timers could complete after unmount. The hook now cancels pending transition timers and ignores validation completion after unmount, with a focused regression test.

## Three Strongest Aspects

- React Query is the default owner for server state, with centralized API behavior in `client/src/lib/queryClient.ts`.
- No `useEffect(async ...)` patterns were found in `client/src`, reducing a common source of unhandled cleanup and stale closure defects.
- Context providers reviewed use memoized values or focused scope, including auth, theme, task drawer, chat drawer, presence, typing, features, and report context.

## Three Most Important Risks

- Hook/state density is concentrated in large pages: `client/src/pages/chat.tsx` has 148 hook/query references; `client/src/components/client-360-tabs.tsx` has 83; `client/src/pages/client-360.tsx` has 81; `client/src/pages/time-tracking.tsx` has 80; `client/src/features/tasks/task-detail-drawer.tsx` has 76.
- Realtime and optimistic update behavior is complex in chat and notifications, making stale cache writes and duplicate subscriptions the highest ROI area for future focused tests.
- Several short-lived UI timers exist for copy states, animation states, polling, and delayed focus. Most are low risk, but timer cleanup should be standardized as touched.

## System Map

Application type: React 18 + Vite frontend backed by Express/Node API.

State layers:
- Server state: React Query queries/mutations through `client/src/lib/queryClient.ts`.
- Realtime state: Socket.IO client in `client/src/lib/realtime/socket.ts`, domain subscriptions in `client/src/lib/realtime/hooks.ts`, chat page listeners, and notification center listeners.
- Local UI state: page/drawer components via `useState`, `useMemo`, `useCallback`, refs, and form state.
- Context state: auth, theme, task drawer, chat drawer, report context, feature flags, presence, and typing.
- Local persistence: selected UI modes, tenant acting context, active timer state, and local storage-backed hooks.

Areas inspected:
- `client/src/pages/*`
- `client/src/components/*`
- `client/src/features/*`
- `client/src/hooks/*`
- `client/src/lib/*`
- `client/src/contexts/*`
- existing architecture docs and package/build scripts

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Recommended remediation | Effort | Risk | Verification |
|---|---|---|---|---|---|---|---|---|---|
| RH-01 | Medium | Confirmed | `client/src/hooks/useAppMode.ts` | `validateTenantExists(...).then(...)` wrote hook state after async completion; `startImpersonation` and `stopImpersonation` used uncancelled `setTimeout(..., 100)`. | If the hook unmounts during a mode switch or tenant validation, React can receive state updates from stale async work. | Added mounted and timeout refs, cleanup on unmount, and a tested scheduler helper. | S | Low | `npx vitest run client/src/__tests__/useAppMode_transition.test.ts`; `npm run check`. |
| RH-02 | Medium | Strongly Supported | `client/src/pages/chat.tsx` | Highest hook density in client: 148 hook/query references; owns conversations, socket events, optimistic sends, read state, reactions, pins, threads, slash commands, and drawer state. | Chat has the highest stale-closure and cache-drift risk because realtime events and optimistic mutations can race. | Split only by responsibility when actively changing chat: message cache reducers, socket subscription hook, and conversation selection hook are the likely first boundaries. | L | Moderate | Chat regression tests around send/read/reaction/thread flows. |
| RH-03 | Medium | Strongly Supported | `client/src/components/client-360-tabs.tsx`, `client/src/pages/client-360.tsx` | 83 and 81 hook/query references respectively. | Client 360 mixes CRM, messages, permissions, merge candidates, and UI tab state. This increases accidental duplicated state risk. | Extract query/view-model hooks for conversations, permissions, and merge candidates as these areas are touched. | M | Moderate | Client 360 tests for tab-specific data and permissions. |
| RH-04 | Low | Confirmed | `client/src/lib/queryClient.ts`, query use across client | Query key scan found no obvious template-literal or concatenated array keys; docs require array segments. | This is a strength, but keeping it enforced avoids cache misses and invalidation drift. | Add a lightweight policy test later if query-key drift appears; no change now. | S | Low | Existing type/build checks and search. |
| RH-05 | Low | Confirmed | `client/src/components/notification-center.tsx`, `client/src/pages/notifications-inbox.tsx` | Notification center uses polling, socket invalidations, read/dismiss mutations, grouped notifications, and animation timers. | This area is now user-visible and tied to prior notification clearing issues, so server/cache/read state should stay tightly tested. | Add notification center tests for socket read/all-read/delete events and grouped read/dismiss behavior before larger UI work. | M | Moderate | Focused client tests using query cache fixtures. |
| RH-06 | Low | Confirmed | `client/src/hooks/useAppMode.ts`, `client/src/lib/auth.tsx`, `client/src/hooks/use-feature-flags.ts` | Auth, feature flags, tenant mode, and prefetch interact during login and impersonation. | Startup and impersonation involve multiple async sources; broad refactors could cause user-mode regressions. | Prefer small tested helper extraction over replacing the state model. | M | Moderate | Auth and impersonation smoke tests plus Railway health checks. |

## Changes Made

- Modified `client/src/hooks/useAppMode.ts`:
  - Added mounted-state and transition-timeout refs.
  - Added `clearPendingAppModeTransition` and `scheduleAppModeTransitionCompletion`.
  - Cleared pending transition timers on unmount.
  - Ignored async tenant validation completion after unmount.
  - Preserved existing impersonation behavior, cache clearing, prefetching, and mode timing.
- Added `client/src/__tests__/useAppMode_transition.test.ts`:
  - Verifies pending transition completion is cancelled on cleanup.
  - Verifies a newer transition replaces an older pending completion.

Compatibility considerations: no API routes, database schemas, query keys, UI copy, feature flags, or deployment config changed.

## Verification Results

Initial targeted verification:
- `npx vitest run client/src/__tests__/useAppMode_transition.test.ts`: passed, 2 tests.
- `npm run check`: passed.

- `git diff --check`: passed.
- `npm run check`: passed.
- `npm test`: passed, 59 files and 616 tests.
- `npm run test:client`: passed, 21 files and 148 tests.
- `npm run build`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Residual build warnings: existing Browserslist data age warning, Tailwind ambiguous arbitrary variant warnings, PostCSS `from` option warning, and large bundle chunk warnings. None were introduced as failing conditions by this audit.

## Residual Risk and Roadmap

Immediate:
- Keep the `useAppMode` transition regression test.
- Avoid broad chat/client-360 hook decomposition while portal stabilization is underway.

Near term:
- Add focused tests around notification center socket events and grouped read/dismiss cache invalidation.
- Extract chat socket subscription and message cache update helpers when the next chat bug fix lands.
- Extract Client 360 data hooks by domain: conversations, permissions, merge candidates, and timeline.

Long term:
- Add a React hooks lint pass when the repo is ready for ESLint adoption, especially `react-hooks/exhaustive-deps`.
- Build a small catalog of approved timer/subscription cleanup helpers for UI animations, copy states, delayed focus, and polling.

Do not pursue now:
- Do not split every large page just because hook count is high. Start with areas under active change and high bug risk.
- Do not replace React Query with global client state for server-owned data.
- Do not add memoization broadly without measured render pressure or clear prop stability needs.

## Final Scorecard

- Server-state ownership: 8/10. React Query is used consistently; complex cache update paths remain in chat and notifications.
- Local state discipline: 7/10. Most state is local and understandable, but several pages carry too many responsibilities.
- Effect cleanup: 7/10 after remediation. No async effects were found; timer/subscription cleanup should continue to tighten as touched.
- Realtime data flow: 6/10. Functionally organized, but stale closure and cache race risk remains in chat/notifications.
- Context boundaries: 8/10. Contexts are focused and memoized; avoid growing auth/app-mode into a broad app store.
- Test coverage for hooks/state: 6/10. Existing client tests are useful but sparse around realtime and optimistic flows.
- Refactor readiness: 7/10. The codebase can support incremental extraction, but broad rewrites would be riskier than targeted splits.
