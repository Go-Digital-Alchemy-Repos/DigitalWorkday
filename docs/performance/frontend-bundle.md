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
| `chat` | 75 | 20 | Chat page (socket, message timeline, composer) |
| `ChatContextPanel` | 7 | 2 | Channel/DM info sidebar (lazy) |
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
| `emoji-picker-react` | 34 MB | Lazy (deferred via `LazyEmojiPicker`) | Chat message input, global chat drawer |
| `@tiptap/*` | 6.6 MB | Lazy (chat/comments) | Rich text editor |
| `recharts` | 5.2 MB | Lazy (reports/dashboards) | Charts and graphs |
| `@fullcalendar/*` | 4.1 MB | Lazy (calendar pages) | Calendar views |
| `framer-motion` | 3.9 MB | Tree-shaken subset | Motion utilities |
| `@dnd-kit/*` | 2.3 MB | Lazy (board views) | Drag-and-drop |
| `socket.io-client` | 1.5 MB | Entry chunk | Real-time communication |

All heavy libraries except `socket.io-client` are now loaded lazily through the route-based splitting — they only download when a user navigates to a page that needs them.

---

## Lazy-Loaded Chat Extras

**Applied:** 2026-02-19

The emoji picker (`emoji-picker-react`, 34 MB on disk) was previously imported eagerly at module scope in both `chat-message-input.tsx` and `global-chat-drawer.tsx`. This meant the full library was parsed and instantiated whenever chat loaded, even if the user never opened the emoji picker.

**Refactor:** Created `LazyEmojiPicker` wrapper component (`client/src/components/lazy-emoji-picker.tsx`) that:
1. Uses `React.lazy(() => import("emoji-picker-react"))` to defer module loading.
2. Only mounts the picker component after the user clicks the emoji button (`hasOpened` guard).
3. Shows a spinner placeholder (300x350px) while the picker loads.
4. Encapsulates Popover, theme detection, and selection callback.

**Files changed:**
- `client/src/components/lazy-emoji-picker.tsx` (new)
- `client/src/components/chat-message-input.tsx` (removed direct `emoji-picker-react` import)
- `client/src/components/global-chat-drawer.tsx` (removed direct `emoji-picker-react` import, removed unused `Popover`, `Smile`, `useTheme` imports)

**Result:** Emoji picker module evaluation is deferred until user interaction. Chat route chunk reduced from ~79 kB to ~75 kB (20 kB gzip); the emoji library (308 kB) loads only on demand.

### ChatContextPanel (lazy-loaded sidebar)

The `ChatContextPanel` (channel/DM info sidebar) was previously bundled into the chat chunk despite only rendering when the user clicks the info toggle. It has been:

1. **Extracted** — `ChatContextPanelToggle` (tiny button) moved to its own file so it stays in the chat chunk. The full `ChatContextPanel` is in a separate file.
2. **Lazy-loaded** — `chat.tsx` uses `React.lazy(() => import("@/features/chat/ChatContextPanel"))` with a Suspense spinner fallback.
3. **Dead code removed** — Unused `ThreadPanel` export removed from the chat barrel, preventing it from being pulled into the chat chunk.

**Files changed:**
- `client/src/features/chat/ChatContextPanelToggle.tsx` (new — tiny toggle button)
- `client/src/features/chat/ChatContextPanel.tsx` (toggle removed, ChevronLeft import removed)
- `client/src/features/chat/index.ts` (barrel updated: toggle from new file, ChatContextPanel removed, ThreadPanel removed)
- `client/src/pages/chat.tsx` (lazy import for ChatContextPanel, Suspense wrapper with spinner fallback)

**Result:**

| Chunk | Before | After |
|---|---|---|
| `chat` | 78.97 kB (20.41 kB gzip) | 74.68 kB (19.86 kB gzip) |
| `ChatContextPanel` (new, lazy) | — | 6.73 kB (2.05 kB gzip) |
| `emoji-picker-react` (lazy) | 308.55 kB (74.73 kB gzip) | 308.55 kB (74.74 kB gzip) |

### No rich text in chat

The chat composer uses a plain `<Textarea>` wrapped by `ChatMessageInput`. There is no tiptap/rich-text editor in the chat flow — tiptap is only used in comment threads and notes elsewhere. No further "progressive enhancement" split is needed.

**Regression checklist:**
- Message send works without opening emoji picker
- Emoji picker opens on button click with brief spinner
- Selected emoji inserts at cursor position
- Mobile composer still works
- Global chat drawer emoji works identically
- Context panel opens with brief spinner on first load, then instantly on subsequent toggles
- Context panel toggle button remains always visible when panel is closed

---

## Barrel Import Cleanup (2026-02-21)

Barrel re-export files (`features/tasks/index.ts`, `features/timer/index.ts`) were causing all exports to be pulled into a single chunk even when only one export was needed. Consumers have been updated to import directly from the source module:

**Before:**
```ts
import { TaskCard } from "@/features/tasks";               // pulls all 7 exports
import { GlobalActiveTimer } from "@/features/timer";       // pulls both exports
```

**After:**
```ts
import { TaskCard } from "@/features/tasks/task-card";      // only task-card module
import { GlobalActiveTimer } from "@/features/timer/global-active-timer";
```

**Files changed:**
- `client/src/pages/home.tsx` — TaskCard direct import
- `client/src/pages/my-tasks.tsx` — SortableTaskCard direct import
- `client/src/pages/project.tsx` — SectionColumn, TaskCard, ListSectionDroppable direct imports
- `client/src/routing/tenantRouter.tsx` — GlobalActiveTimer, MobileActiveTimerBar direct imports

The barrel files are kept for backward compatibility but should not be used for new imports.

---

## Bundle Analysis

Run `npx vite-bundle-visualizer` from the project root to generate an interactive treemap of the production bundle:

```bash
npx vite-bundle-visualizer
```

This generates `stats.html` in the project root showing chunk sizes, dependencies, and tree-shaking effectiveness.

---

## Manual Vendor Chunks (Planned)

The following vendor chunk strategy is recommended when `vite.config.ts` modification is permitted:

| Chunk | Packages |
|---|---|
| `vendor-react` | react, react-dom, wouter, @tanstack/react-query |
| `vendor-radix` | @radix-ui/* (dialog, dropdown, popover, select, tabs, etc.) |
| `vendor-dnd` | @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @dnd-kit/modifiers |
| `vendor-charts` | recharts |
| `vendor-editor` | @tiptap/core, @tiptap/react, @tiptap/starter-kit, extensions |
| `vendor-socket` | socket.io-client |

Benefits:
- **Cache stability** — vendor chunks change rarely, giving browsers long cache hits
- **Parallel loading** — multiple smaller chunks load faster than one monolith
- **Deploy efficiency** — app code changes don't invalidate vendor cache

---

## Future Optimisation Opportunities

1. **Prefetching** — Predictive prefetch after login/session-restore is implemented (see `docs/performance/prefetch.md`). Further `<link rel="prefetch">` hints could be added for route chunks based on heuristics.
2. **Icon library** — `react-icons` (83 MB on disk) is tree-shaken, but auditing for unused icon imports could further reduce bundle size.
3. **CSS splitting** — The CSS is currently a single 148 kB file; CSS modules or route-level CSS splitting could improve first-paint metrics.
