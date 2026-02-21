# Predictive Prefetch After Authentication

**Added:** 2026-02-19
**Updated:** 2026-02-21 — Feature flag guard (`PREFETCH_V1`)

---

## Purpose

After a user logs in (or has their session restored), the most commonly visited tenant routes are prefetched in the background. This primes the browser's module cache so that navigating to these pages feels instant instead of triggering a lazy-load delay.

---

## Feature Flag

Prefetch is guarded behind the `PREFETCH_V1` feature flag.

| Layer | Location | Default |
|---|---|---|
| Server env | `PREFETCH_V1` env var | `true` (on) |
| Server config | `config.features.prefetchV1` | `true` |
| API endpoint | `GET /api/features/flags` → `prefetchV1` | `true` |
| Client hook | `useFeatureFlags().prefetchV1` | `false` (safe fallback) |

Set `PREFETCH_V1=false` to disable prefetch globally without a code deploy.

---

## How It Works

### Trigger Points

| Trigger | File | When |
|---|---|---|
| Session restore | `client/src/lib/auth.tsx` | After `/api/auth/me` returns a valid user |
| Login form success | `client/src/lib/auth.tsx` | After `login()` completes and `/me` re-fetch succeeds |
| Tenant selection | `client/src/hooks/useAppMode.ts` | When super user enters tenant mode via `startImpersonation()` |

Session restore and login call `triggerPrefetch(role)` which fetches the flag from `/api/features/flags` and then delegates to `prefetchPostLogin({ role, prefetchEnabled })`. Tenant selection calls `prefetchTenantRoutes(prefetchV1)` using the hook value.

### Scheduling

Prefetch is deferred so it never competes with the first render:

1. `requestIdleCallback` (preferred) with a 3-second timeout fallback.
2. `setTimeout(fn, 300)` if `requestIdleCallback` is unavailable.

### Connection Gating

Prefetch is **skipped entirely** when:

- `navigator.connection.saveData` is `true` (user opted to save data).
- `navigator.connection.effectiveType` is `"2g"` or `"slow-2g"`.
- Prefetch has already fired in the current session (`prefetchFired` guard).
- `prefetchEnabled` is `false` (flag disabled).

### Max Prefetch Count

A maximum of **6** dynamic `import()` calls are issued per session. This cap is defined by `MAX_PREFETCH_OPS` in `prefetch.ts`.

### Role Gating

| Role | Prefetch? | Reason |
|---|---|---|
| Tenant user (default) | Yes | Most common user type; prefetches tenant routes |
| `client` | No | Client portal has its own route set |
| `super_user` | No | Super admin has its own route set |

---

## Prefetched Routes

These modules are prefetched for tenant users:

| Module | Import Path |
|---|---|
| Tenant layout shell | `@/routing/tenantRouter` |
| Home | `@/pages/home` |
| My Tasks | `@/pages/my-tasks` |
| Projects Dashboard | `@/pages/projects-dashboard` |
| Chat (shell only) | `@/pages/chat` |
| My Time | `@/pages/my-time` |

Heavy extras (emoji picker, rich text editor, calendar libraries) are **not** prefetched — they load on demand when the user interacts with them.

---

## State Management

- `prefetchFired` prevents duplicate prefetch across session-restore and login paths.
- `resetPrefetchState()` is called on logout so prefetch fires again for the next user.

---

## Files

| File | Role |
|---|---|
| `client/src/lib/prefetch.ts` | Orchestrator: gating, scheduling, module list, flag check |
| `client/src/lib/auth.tsx` | Calls `triggerPrefetch()` on session restore and login; resets on logout |
| `client/src/hooks/useAppMode.ts` | Calls `prefetchTenantRoutes(prefetchV1)` on tenant selection |
| `client/src/hooks/use-feature-flags.ts` | Provides `prefetchV1` flag from server |
| `server/config.ts` | `config.features.prefetchV1` from `PREFETCH_V1` env var |
| `server/http/domains/flags.router.ts` | Exposes `prefetchV1` in `/api/features/flags` |

---

## Verification

- No runtime errors in browser console after login.
- Network tab shows prefetch loads fire once (idle/deferred).
- No prefetch for client portal or super admin users.
- Subsequent navigation to prefetched pages is instant (no loading spinner).
- Set `PREFETCH_V1=false` → prefetch does not fire.
