# Frontend Routing Architecture

**Last updated:** 2026-02-21

---

## Overview

The frontend uses a **role-based router decomposition** pattern. `App.tsx` acts as a thin orchestrator that detects the user's role and current URL, then delegates to one of four domain-specific routers.

```
App.tsx (providers + role detection)
├── AuthRouter      — public auth pages (login, invite, password reset)
├── SuperLayout     — super admin dashboard and tools
├── TenantLayout    — standard tenant workspace
└── ClientPortalLayout — external client portal
```

---

## File Structure

```
client/src/routing/
├── index.ts              — barrel re-exports
├── authRouter.tsx         — auth/public routes (login, invites, password reset)
├── tenantRouter.tsx       — tenant workspace routes + layout shell
├── superRouter.tsx        — super admin routes + layout shell
├── portalRouter.tsx       — client portal routes + layout shell
└── guards.ts             — route guards and withRoleGuard HOC
```

---

## App.tsx Responsibilities

App.tsx is intentionally minimal (~120 lines). It handles:

1. **Provider wrapping** — QueryClient, Theme, Auth, Presence, Typing, Features, TenantTheme
2. **Auth route detection** — `isAuthRoute(location)` checks if the current path is a public auth page
3. **Role-based routing** — reads `user.role` and `appMode` to select the correct layout

```
AppLayout flow:
  1. Auth route?  → <AuthRouter />
  2. Loading?     → <PageSkeleton />
  3. Not authed?  → Redirect /login
  4. Client user? → <ClientPortalLayout />
  5. Super mode?  → <SuperLayout />
  6. Default      → <TenantLayout />
```

---

## Route Guards

Guards are React components that wrap page components with auth/role checks.

### Available Guards

| Guard | Role | Behavior |
|---|---|---|
| `ProtectedRoute` | any authenticated | Redirect to `/login` if not authed |
| `SuperRouteGuard` | `super_user` | Redirect to `/` if not super user |
| `TenantRouteGuard` | tenant member | Redirect super users in super mode to `/super-admin/dashboard` |
| `ClientPortalRouteGuard` | `client` | Redirect non-clients to `/` |

### withRoleGuard HOC

The `withRoleGuard(role)` factory returns a guard component for the given role:

```tsx
import { withRoleGuard } from "@/routing/guards";

const TenantGuard = withRoleGuard("tenant");
const SuperGuard = withRoleGuard("super_user");
const PortalGuard = withRoleGuard("client");
const AuthGuard = withRoleGuard("authenticated");

// Usage in routes:
<Route path="/dashboard">
  {() => <TenantGuard component={DashboardPage} />}
</Route>
```

Supported roles: `"super_user"`, `"client"`, `"tenant"`, `"authenticated"`

---

## Lazy Loading

All page components use `React.lazy()` with `trackChunkLoad()` for performance telemetry:

```tsx
const Home = lazy(trackChunkLoad("Home", () => import("@/pages/home")));
```

Each router wraps its `<Switch>` in a `<Suspense>` boundary with a `<PageSkeleton />` fallback.

Layout components (TenantLayout, SuperLayout, ClientPortalLayout) are also lazily loaded from App.tsx:

```tsx
const TenantLayout = lazy(() =>
  import("@/routing/tenantRouter").then(m => ({ default: m.TenantLayout }))
);
```

---

## Auth Router

`authRouter.tsx` handles all public/semi-public auth pages:

| Path | Component | Guard |
|---|---|---|
| `/login` | LoginPage | none |
| `/tenant-onboarding` | TenantOnboardingPage | ProtectedRoute |
| `/accept-terms` | AcceptTermsPage | ProtectedRoute |
| `/auth/platform-invite` | PlatformInvitePage | none |
| `/accept-invite/:token` | AcceptInvitePage | none |
| `/auth/forgot-password` | ForgotPasswordPage | none |
| `/auth/reset-password` | ResetPasswordPage | none |

The `isAuthRoute(location)` helper is used by App.tsx to detect auth routes before checking authentication state.

---

## Tenant Router

`tenantRouter.tsx` contains ~25 routes covering the full workspace experience:

- Home, My Tasks, Projects, Calendar, Chat
- Clients (CRM), Client Detail, CRM Pipeline, Follow-ups
- Time Tracking, My Calendar
- Reports, Templates, Teams
- Support (tickets, templates, SLA, forms)
- Settings, Account, User Manager, Design System

All routes use `TenantRouteGuard` except `/profile` (uses `ProtectedRoute`).

The tenant layout includes: sidebar, header bar, command palette, notification center, chat drawer, active timer.

---

## Super Admin Router

`superRouter.tsx` contains ~10 routes for platform administration:

- Dashboard, Tenants, Users, Settings
- System Status, Docs, Docs Coverage
- Chat Monitoring, Profile

All routes use `SuperRouteGuard`.

---

## Client Portal Router

`portalRouter.tsx` contains ~10 routes for external clients:

- Dashboard, Projects, Project Detail, Tasks
- Approvals, Messages, Chat
- Support (list, new, detail)

All routes use `ClientPortalRouteGuard`.

---

## Adding a New Route

1. Create the page component in `client/src/pages/`
2. Add a `lazy()` import in the appropriate router file
3. Add a `<Route>` entry with the correct guard
4. The route will be automatically code-split into its own chunk
