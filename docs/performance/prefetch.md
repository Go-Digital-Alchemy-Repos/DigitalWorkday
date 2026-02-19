# Predictive Prefetch After Authentication

**Added:** 2026-02-19

---

## Purpose

After a user logs in (or has their session restored), the most commonly visited tenant routes are prefetched in the background. This primes the browser's module cache so that navigating to these pages feels instant instead of triggering a lazy-load delay.

---

## How It Works

### Trigger Points

| Trigger | File | When |
|---|---|---|
| Login form success | `client/src/pages/login.tsx` | After `login()` returns `success: true` |
| Session restore | `client/src/lib/auth.tsx` | After `/api/auth/me` returns a valid user |

Both call `prefetchPostLogin(role)` from `client/src/lib/prefetch.ts`.

### Scheduling

Prefetch is deferred so it never competes with the first render:

1. `requestIdleCallback` (preferred) with a 3-second timeout fallback.
2. `setTimeout(fn, 300)` if `requestIdleCallback` is unavailable.

### Connection Gating

Prefetch is **skipped entirely** when:

- `navigator.connection.saveData` is `true` (user opted to save data).
- `navigator.connection.effectiveType` is `"2g"` or `"slow-2g"`.
- Prefetch has already fired in the current session (`prefetchFired` guard).

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
| `client/src/lib/prefetch.ts` | Orchestrator: gating, scheduling, module list |
| `client/src/lib/auth.tsx` | Calls prefetch on session restore; resets on logout |
| `client/src/pages/login.tsx` | Calls prefetch on login success |

---

## Verification

- No runtime errors in browser console after login.
- Network tab shows prefetch loads fire once (idle/deferred).
- No prefetch for client portal or super admin users.
- Subsequent navigation to prefetched pages is instant (no loading spinner).
