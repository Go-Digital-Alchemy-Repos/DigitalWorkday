# Mobile UX Audit — Phase 1

**Date:** 2026-02-17  
**Viewport tested:** 375px (iPhone SE baseline)  
**Breakpoint system:** Tailwind defaults + `useIsMobile()` at 768px

---

## 1. App Shell Layout

### Current structure
- `SidebarProvider` wraps all layouts (Tenant, Super Admin, Client Portal)
- Sidebar collapses on mobile via Shadcn sidebar behavior
- Header: fixed at `h-12` (48px) with `shrink-0` — good baseline
- Main: `flex-1 overflow-hidden` with conditional `pb-16` for mobile bottom nav
- MobileNavBar: fixed bottom, ~64px tall, only rendered when `isMobile`

### Issues found
| Area | Issue | Severity |
|------|-------|----------|
| Page padding | Inconsistent across pages: `p-2`, `p-4`, `p-6`, `px-2`, `px-4 md:px-6` | Medium |
| No PageContainer | Each page manages its own max-width and padding | Medium |
| Super Admin layout | Missing `pb-16` for mobile bottom nav — content may be clipped | High |
| Client Portal layout | Has its own MobileNav but padding consistency not verified | Medium |

---

## 2. Tap Target Sizing

### Current component sizes
| Component | Height | Mobile target (44px) | Status |
|-----------|--------|----------------------|--------|
| Button (default) | `min-h-9` (36px) | Below target | Needs fix |
| Button (sm) | `min-h-8` (32px) | Below target | Needs fix |
| Button (lg) | `min-h-10` (40px) | Close to target | OK |
| Button (icon) | `h-9 w-9` (36px) | Below target | Needs fix |
| Input | `h-9` (36px) | Below target | Needs fix |
| Sidebar items | ~36px | Below target | Low priority |

### Recommendation
Apply responsive height: `min-h-10 md:min-h-9` for default buttons, `h-10 md:h-9` for inputs on mobile.

---

## 3. Scroll Behavior

### Patterns found
| Page | Scroll setup | Issue |
|------|-------------|-------|
| home.tsx | `overflow-auto` on inner wrapper | OK |
| project.tsx | Board view: `overflow-x-auto` on columns | OK |
| project.tsx | List view: `overflow-y-auto` on list | OK |
| my-tasks.tsx | `overflow-auto` on main content | OK |
| my-time.tsx | `overflow-auto` on content area | OK |
| chat.tsx | `h-full` flex layout | Complex but functional |
| settings.tsx | `overflow-auto` on root | OK |
| projects-dashboard.tsx | No explicit scroll wrapper on table | Needs fix |
| clients.tsx | Cards layout, no scroll issues | OK |

### Nested scroll risks
- chat.tsx: Multiple nested flex/overflow containers — works but fragile
- project.tsx board view: horizontal scroll inside vertical scroll — acceptable pattern

---

## 4. Table Overflow

### Tables found
| Page | Table | Has `overflow-x-auto` wrapper | Status |
|------|-------|-------------------------------|--------|
| projects-dashboard.tsx | Project list table | No (wrapped in `overflow-hidden`) | Needs fix |
| team-detail.tsx | Team members table | No | Needs fix |
| clients.tsx | Custom table header (not Shadcn Table) | N/A — uses card/list pattern | OK |

### Recommendation
Add `overflow-x-auto` wrapper around all `<Table>` components to prevent horizontal layout breaking on mobile.

---

## 5. Component Density

### Card padding
| Page | Card padding | Mobile-friendly |
|------|-------------|-----------------|
| home.tsx | Default CardHeader/CardContent | OK — Shadcn defaults |
| projects-dashboard.tsx | Default | OK |
| clients.tsx | Custom density toggle (compact/comfortable) | Good |
| my-time.tsx | `p-4 md:p-6` | Good pattern |

### Form spacing
| Page | Pattern | Issue |
|------|---------|-------|
| Login/forgot-password | `space-y-4`, full-width inputs | Good |
| Settings | Tab-based, grid layouts | Dense on mobile |
| Project create dialog | Modal-based | OK on mobile |

---

## 6. Keyboard Overlap Risks

| Screen | Risk | Mitigation |
|--------|------|-----------|
| Chat message input | Input at bottom of screen | Fixed position — may overlap with keyboard |
| Comment editors (TipTap) | Inline in drawers/modals | Drawer may not scroll to input on keyboard open |
| Task create forms | In modals/drawers | Standard drawer scrolling should handle this |
| Login form | Centered layout | Low risk — simple form |

---

## 7. Page-by-Page Findings

### home.tsx
- Grid: `grid-cols-2 lg:grid-cols-4` — works at 375px
- Padding: `p-4 md:p-6` — good responsive pattern
- Stats cards may be cramped at 375px with 2-column grid

### project.tsx
- Board view: horizontal scroll works but columns may be too wide
- Section padding: `p-4 md:p-6` — good
- Task cards: reasonable density

### my-tasks.tsx
- Has drag-and-drop — may conflict with mobile touch scrolling
- Padding: mixed patterns
- `overflow-auto` on content area — good

### chat.tsx (2672 lines)
- Complex layout with sidebar + message area
- Uses `h-full` flex — works on desktop, may have viewport height issues on mobile
- Message input area at bottom — keyboard overlap risk
- Mobile: sidebar may need toggle behavior (already handled by Shadcn sidebar)

### my-time.tsx
- Timer controls: `p-4 md:p-6` — good
- Time entry list: adequate spacing
- Stopwatch buttons: need adequate tap targets

### projects-dashboard.tsx
- Table hidden on mobile (`hidden md:block`) — good, shows cards on mobile
- Filter bar: horizontal scroll with `overflow-x-auto` — good
- Card grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — good

### settings.tsx
- Simple wrapper delegating to settings tabs
- Tab navigation may be dense on mobile
- Needs consistent container padding

### clients.tsx
- Density toggle (compact/comfortable) — good for mobile
- Grid: `sm:grid-cols-2 lg:grid-cols-3` — stacks on mobile
- Table view hidden on mobile — good pattern

---

## 8. Summary of Required Changes

### High Priority
1. Create shared `PageContainer` component for consistent page layout
2. Increase mobile tap target sizes (Button/Input to 40px)
3. Wrap tables in `overflow-x-auto` containers

### Medium Priority
4. Normalize page padding scale across all pages
5. Ensure all layouts apply `pb-16` when mobile bottom nav is visible

### Low Priority
6. Audit keyboard overlap for chat message input
7. Consider reducing card grid columns on very small screens
8. Improve settings tab navigation density on mobile
