# Frontend Bundle Performance

**Last updated:** 2026-02-19

---

## Baseline (Before Optimisation)

| Metric | Value |
|---|---|
| Total JS output | 3,793 kB (976 kB gzip) |
| Chunk count | 1 (monolithic) |
| CSS output | 148 kB (23 kB gzip) |
| Build time | ~28 s |

The entire application — all pages, all vendor libraries — was shipped in a single JavaScript file. Every user paid the full download cost regardless of which page they visited.

---

## Changes Applied

### 1. Route-Based Code Splitting (React.lazy + Suspense)

All page components are now lazily loaded via `React.lazy()` with dynamic `import()`:

- **App.tsx** — Lazily loads `TenantLayout`, `SuperLayout`, `ClientPortalLayout`, and all auth pages (login, password reset, invite accept, onboarding).
- **tenantRouter.tsx** — 21 lazily loaded page components (Home, MyTasks, ProjectsDashboard, ChatPage, ReportsPage, CalendarPage, SettingsPage, etc.)
- **superRouter.tsx** — 9 lazily loaded page components (dashboard, tenants, settings, docs, chat monitoring, users, profile).
- **portalRouter.tsx** — 7 lazily loaded page components (dashboard, projects, tasks, approvals, messages, chat).

Each `lazy()` call creates a natural code-split point. Vite/Rollup emits a separate chunk per page module.

### 2. Suspense Boundaries

Suspense fallbacks display a centered spinner (`Loader2`) at two levels:

- **Layout level** — In `App.tsx`, each layout variant is wrapped in `<Suspense>` so the initial shell loads before route content.
- **Router level** — Inside each router component, a `<Suspense>` wraps the `<Switch>` so page transitions show the fallback while the next chunk loads.

### 3. Unused Dependency Removal

| Package | Reason |
|---|---|
| `next-themes` | Zero imports anywhere in the codebase; custom `ThemeProvider` used instead |
| `use-sound` | Zero imports anywhere in the codebase |
| `embla-carousel-react` | Only imported by unused `ui/carousel.tsx` scaffold; no pages consumed it |
| `input-otp` | Only imported by unused `ui/input-otp.tsx` scaffold; no pages consumed it |
| `react-resizable-panels` | Only imported by unused `ui/resizable.tsx` scaffold; no pages consumed it |

Corresponding unused UI component files (`carousel.tsx`, `input-otp.tsx`, `resizable.tsx`) were deleted.

---

## Results (After Optimisation)

| Metric | Before | After | Change |
|---|---|---|---|
| Entry JS chunk | 3,793 kB | 517 kB | **-86%** |
| Entry JS gzip | 976 kB | 148 kB | **-85%** |
| Total chunk count | 1 | ~24 | Route-based splitting |
| Build time | ~28 s | ~22 s | -21% |

### Chunk Breakdown (production build)

| Chunk | Size (kB) | gzip (kB) | Contents |
|---|---|---|---|
| `index` (entry) | 517 | 148 | React, wouter, react-query, auth, theme, providers |
| Shared deps | 1,129 | 324 | Radix UI, sidebar, shadcn components, shared utilities |
| `tenantRouter` | 125 | 32 | Tenant layout shell, sidebar, command palette |
| `super-admin` | 191 | 40 | Super admin tenant management |
| `super-admin-status` | 93 | 18 | System status page |
| `client-detail` | 85 | 17 | Client detail CRM page |
| `chat` | 79 | 21 | Chat page (tiptap, emoji picker, socket) |
| `super-admin-settings` | 64 | 13 | Super admin settings |
| `project` | 58 | 16 | Project detail page |
| `asana-import-wizard` | 57 | 13 | Import wizard |
| `super-admin-users` | 52 | 10 | User management |
| `client-360` | 50 | 12 | Client 360 view |
| `my-time` | 48 | 11 | Time tracking |
| `reports` | 42 | 11 | Reports page (recharts) |
| `color-picker` | 41 | 15 | Color picker (react-colorful) |
| `account` | 39 | 9 | Account settings |
| `settings` | 37 | 9 | Tenant settings |
| `S3Dropzone` | 35 | 11 | File upload component |
| `clients` | 33 | 8 | Clients list page |
| `BarChart` | 377 | 103 | Recharts library (shared by reports/dashboards) |
| `PieChart` | 26 | 7 | Recharts PieChart sub-chunk |
| `user-manager` | 25 | 7 | User manager page |

### Loading Behaviour

1. **Login page** — Only the entry chunk + login page chunk are loaded (~520 kB gzip total).
2. **First authenticated page** — The shared deps chunk and the specific layout + page chunk load on demand.
3. **Subsequent navigation** — Only the target page chunk loads; shared deps are already cached.

---

## Heavy Libraries (Bundled Size Reference)

| Library | node_modules size | Bundle impact | Used by |
|---|---|---|---|
| `react-icons` | 83 MB | Tree-shaken (only `si` icons) | Company logos |
| `emoji-picker-react` | 34 MB | Lazy (chat page only) | Chat message input |
| `@tiptap/*` | 6.6 MB | Lazy (chat/comments) | Rich text editor |
| `recharts` | 5.2 MB | Lazy (reports/dashboards) | Charts and graphs |
| `@fullcalendar/*` | 4.1 MB | Lazy (calendar pages) | Calendar views |
| `framer-motion` | 3.9 MB | Tree-shaken subset | Motion utilities |
| `@dnd-kit/*` | 2.3 MB | Lazy (board views) | Drag-and-drop |
| `socket.io-client` | 1.5 MB | Entry chunk | Real-time communication |

All heavy libraries except `socket.io-client` are now loaded lazily through the route-based splitting — they only download when a user navigates to a page that needs them.

---

## Future Optimisation Opportunities

1. **Manual vendor chunks** — If `vite.config.ts` modification is permitted, `manualChunks` can group vendor libraries (recharts, fullcalendar, tiptap, dnd-kit) into dedicated cacheable chunks that persist across deploys.
2. **Prefetching** — Add `<link rel="prefetch">` hints for likely next-page chunks (e.g., prefetch the Home chunk after login completes).
3. **Dynamic import for emoji picker** — The emoji picker inside chat could use a secondary lazy boundary so it only loads when the user opens the picker, not when they open chat.
4. **Icon library** — `react-icons` (83 MB on disk) is tree-shaken, but auditing for unused icon imports could further reduce bundle size.
5. **CSS splitting** — The CSS is currently a single 148 kB file; CSS modules or route-level CSS splitting could improve first-paint metrics.
