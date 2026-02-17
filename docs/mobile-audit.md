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

---

# Phase 3A — Tasks Mobile UX Optimization

**Date:** 2026-02-17  
**Scope:** Task management workflow for sub-768px viewports

## Changes Made

### 1. Mobile Task Card (task-card.tsx)
- **New mobile layout**: On `isMobile`, list-view cards switch from CSS grid to flex layout
- **Title + assignee row**: Title takes full width with assignee avatars right-aligned
- **Metadata row**: Priority badge, due date, personal badge, subtask count, project name shown inline below title
- **Tags row**: Shows up to 2 tags with overflow count
- **Tap targets**: Checkbox enlarged to `min-h-5 min-w-5` for touch
- **Drag handle**: Always visible on mobile (no hover-only opacity)
- **Quick actions**: Removed on mobile (available in task detail drawer instead)
- **Desktop layout**: Unchanged — grid-based with hover quick actions

### 2. DataToolbar Mobile Layout (data-toolbar.tsx)
- **Search**: Full-width on mobile (stacks above filter controls)
- **Layout**: Switches from single-row flex to stacked layout (`flex-col` on mobile, `flex-row` on desktop)
- **Filter button**: Uses `size="sm"` on mobile for compact appearance
- **Sort dropdown**: Narrower width on mobile (`w-[140px]` vs `w-[180px]`)

### 3. Task Detail Drawer (task-detail-drawer.tsx)
- **Full-width on mobile**: Removes `sm:max-w-2xl` constraint, fills entire viewport
- **Reduced padding**: `px-4 py-3` header / `px-4 py-4` body on mobile vs `px-6 py-4` / `px-6 py-6` desktop
- **Single-column metadata**: Grid switches from `grid-cols-2` to `grid-cols-1` on mobile
- **Full-width form controls**: DatePicker, PrioritySelector, StatusSelector, Input all use `w-full h-10` on mobile
- **Touch-friendly controls**: Form inputs use `h-10` (40px) on mobile for better tap targets

### 4. Subtask Detail Drawer (subtask-detail-drawer.tsx)
- **Full-width on mobile**: Fills entire viewport width
- **Responsive padding**: `px-3 py-3` header / `px-3 py-4` body on mobile vs `px-6 py-4` / `px-6 py-6` desktop
- **Single-column metadata**: Grid switches from `grid-cols-2` to `grid-cols-1` on mobile via `useIsMobile()`
- **Full-width form controls**: PrioritySelector, StatusSelector, DueDate, Estimate all use `w-full` on mobile
- **Feature parity with TaskDetailDrawer**: CommentThread (with optimistic updates), MultiSelectAssignees (via apiPrefix), AttachmentUploader, tags, created-at display
- **Responsive breadcrumbs**: Truncation at `max-w-[120px]` on mobile vs `max-w-[150px]` desktop
- **Comments section**: Light grey background (`bg-muted/30`) with responsive padding

### 5. My Tasks Page (my-tasks.tsx)
- **Dashboard summary**: Hidden on mobile (`hidden md:block`) to maximize task list space
- **Task list**: Already responsive with `grid-cols-1 lg:grid-cols-2`

### 6. Chat Mobile Navigation (Phase 3B — chat.tsx)
- **Sidebar/conversation toggle**: On mobile, channel list and conversation area are mutually exclusive (`showMobileList` / `showMobileConversation`)
- **Back button**: ArrowLeft button in conversation header navigates back to channel list, clears selected channel/DM
- **Keyboard-safe composer**: `visualViewport` API tracks virtual keyboard height, applies dynamic `paddingBottom` to composer form via `keyboardOffset` state
- **Responsive padding**: Conversation header `px-2 sm:px-4`, composer `px-2 sm:px-4 py-2 sm:py-3`
- **Safe area insets**: Composer padding includes `env(safe-area-inset-bottom)` for notched devices

### 7. Time Tracking Mobile (Phase 3C — time-tracking.tsx, my-time.tsx)
- **MobileActiveTimerBar**: Persistent fixed bar at `bottom-16` (above MobileNavBar), shows running timer with pause/resume/stop controls, label truncation, `z-40`
- **Dynamic content padding**: Main content uses `pb-28` when timer bar is active (vs `pb-16` without)
- **ActiveTimerPanel responsive**: Timer icon `h-12 w-12 sm:h-16 sm:w-16`, text `text-3xl sm:text-4xl`, buttons stack vertically on small screens with `flex-col sm:flex-row`
- **No-timer CTA**: Full-width Start Timer button on mobile (`w-full sm:w-auto`)
- **Time entries list**: Card header stacks on mobile (`flex-col sm:flex-row`), entry rows wrap on mobile (`flex-col sm:flex-row`), duration/actions align left on mobile
- **Add button**: Icon-only on mobile, "Add Manual Entry" text on desktop (`hidden sm:inline`)

### 8. Cache Hardening (H1 — use-active-timer.ts, time-tracking.tsx)
- **Optimistic updates**: pause, resume, stop, and delete mutations all use `onMutate` to optimistically update timer cache before server response
- **Rollback on error**: All mutations restore previous timer state from `context.previousTimer` on failure
- **Stats cache invalidation**: All timer and time-entry mutations (start, stop, create, update, delete) invalidate both `/api/time-entries` and `/api/time-entries/my/stats` query keys
- **Cross-tab sync**: BroadcastChannel and localStorage fallback also invalidate stats cache
- **Stop mutation**: Optimistically clears timer to `null` immediately, rolls back on error

## Verification Checklist

- [ ] Task cards render with stacked layout on mobile (< 768px)
- [ ] Checkbox tap target is at least 40px
- [ ] Priority, due date, project name visible in card metadata row
- [ ] Search bar full-width on mobile
- [ ] Filters popover accessible on mobile
- [ ] Task detail drawer fills full width on mobile
- [ ] Metadata grid single-column on mobile
- [ ] Form controls full-width and touch-friendly (40px height)
- [ ] Dashboard summary hidden on mobile
- [ ] No horizontal overflow on task cards
- [ ] Drag-and-drop handle visible (not hidden behind hover)
- [ ] Subtask drawer metadata single-column on mobile
- [ ] Subtask drawer comments section renders and accepts input
- [ ] Subtask drawer assignee picker uses MultiSelectAssignees component
- [ ] Subtask drawer attachments section visible when project exists
- [ ] Chat: mobile back button returns to channel list
- [ ] Chat: only one panel visible at a time on mobile (list OR conversation)
- [ ] Chat: composer adjusts for virtual keyboard on mobile
- [ ] Timer bar appears above MobileNavBar when timer is active
- [ ] Timer bar shows running time, label, pause/resume/stop
- [ ] ActiveTimerPanel stacks vertically on small screens
- [ ] Time entries list wraps to card layout on mobile
- [ ] Stop timer immediately clears UI (optimistic update)
- [ ] Stats dashboard updates after timer stop/time entry changes

---

## Phase 3 Hardening — UI Consistency Pass

**Date:** 2026-02-17

### DrawerActionBar Component
- Shared `DrawerActionBar` component at `client/src/components/layout/drawer-action-bar.tsx`
- Standardized footer action bar with consistent button ordering:
  - **Start Timer** (orange, `bg-orange-600`) — left side
  - **Save** (blue, `bg-blue-600`) — right side, before complete
  - **Mark Complete** (green, `bg-green-600`) — rightmost
- All action bar buttons have `min-h-[44px]` for mobile tap targets
- Timer state machine: idle, running, paused, loading, hidden
- Supports extra actions slot (e.g., "Timer running on another task" badge)

### TaskDetailDrawer Changes
- Action bar moved from header area to sticky footer using `DrawerActionBar`
- "Save Changes" button removed from header — Save now in footer
- Duplicate "Start Timer" removed from Time Entries section header
- Section order standardized: Description → Attachments → Subtasks → Tags → Comments → Time Entries
- Comments section wrapped in `bg-muted/30` background
- Body uses `space-y-6` for consistent section spacing

### SubtaskDetailDrawer Changes
- Old full-width "Save Subtask" footer replaced with `DrawerActionBar`
- Complete/Reopen button moved from header to footer action bar
- Section order standardized: Title → Metadata → Description → Attachments → Tags → Comments
- Comments section already had `bg-muted/30` wrapping
- Body spacing normalized from `space-y-5` to `space-y-6`

### Consistency Checklist
- [x] DrawerActionBar used in TaskDetailDrawer
- [x] DrawerActionBar used in SubtaskDetailDrawer
- [x] Action bar button ordering consistent (Timer | Save | Complete)
- [x] Comments wrapped in bg-muted/30 in both drawers
- [x] Section order normalized across drawers
- [x] Body spacing normalized to space-y-6
- [x] Action bar buttons meet 44px tap target
- [x] EmptyState, LoadingState, ErrorState components available via layout barrel

---

## Sprint Update: 2026-02-17 System Review

### Performance Improvements
- Chat page: 6 utility functions moved outside component body, 7+ values memoized
- Time tracking page: 4 components wrapped with React.memo, computed values memoized
- Socket room join handlers wrapped with authentication policy (security fix)

### PageContainer Usage Audit
Pages using PageContainer/PageShell: crm-pipeline, crm-followups, client-360, clients, projects-dashboard, my-tasks
Pages with custom padding: Most other pages manage own padding via inline classes
Recommendation: Migrate remaining pages to PageContainer in next sprint

### Mobile Bottom Nav Padding
- `pb-16` applied in App.tsx main content area
- Consistent across tenant layout
- Super admin and client portal layouts should be verified

---

## Chat Premium C1 — Typing Awareness

### Summary
End-to-end typing indicator system for chat channels and DMs.

### Architecture
- **Backend state**: `server/realtime/typing.ts` — in-memory Map keyed by `conversationId` → Map(`userId` → `TypingEntry` with TTL)
- **Socket events**: `TYPING_EVENTS.START` / `TYPING_EVENTS.STOP` (client→server), `CHAT_EVENTS.TYPING_UPDATE` (server→client broadcast)
- **Policy**: All handlers wrapped with `withSocketPolicy({ requireAuth, requireTenant, requireChatMembership })`
- **TTL**: 5-second expiry with 1-second cleanup interval; also cleans up on socket disconnect
- **Frontend hook**: `client/src/hooks/use-typing.tsx` — `TypingProvider` context with throttled start (1s), auto-stop (1.2s inactivity)
- **UI**: Fixed-height `h-6` indicator bar above composer (no layout jump); animated dots + name resolution

### Mobile-Friendly Design
- Indicator bar always reserves `h-6` space — prevents layout jump when typing state changes
- Text truncates gracefully: 1 user → name, 2 users → both names, 3+ → "Several people are typing..."
- No additional padding or spacing changes needed

### Tests
- `server/tests/typing.test.ts` — 11 tests covering:
  - State tracking (start, stop, duplicate, multi-user merge)
  - TTL expiration clears state
  - Socket disconnect cleanup
  - ConversationId parsing
  - Policy enforcement (unauth denied, wrong tenant denied, non-member denied, member allowed)

### Verification Checklist
- [ ] Open two browser tabs logged in as different users in same tenant
- [ ] Both join the same channel
- [ ] User A starts typing → User B sees "{Name} is typing..." above composer
- [ ] User A stops typing (or waits 5s) → indicator disappears for User B
- [ ] User A sends message → indicator clears immediately
- [ ] Indicator bar does not cause layout jump (always `h-6`)
- [ ] Mobile: indicator text readable, no overflow issues

---

## Chat Premium C2 — Read Receipts

### Summary
Conversation-level read receipts using existing `chat_reads` table. No schema changes needed.

### Storage
- **Table**: `chat_reads` (existing)
- **Fields used**: `userId`, `channelId`/`dmThreadId`, `lastReadMessageId`, `lastReadAt`, `tenantId`
- **New storage method**: `getConversationReadReceipts(targetType, targetId, tenantId)` — returns all read receipts for a conversation

### API
- **Existing**: `POST /api/v1/chat/reads` — marks a conversation as read, broadcasts `CHAT_EVENTS.CONVERSATION_READ`
- **New**: `GET /api/v1/chat/reads/:targetType/:targetId` — fetches all read receipts for a conversation (auth + tenant + membership enforced)

### Socket Events
- **Existing**: `chat:conversationRead` (server→client broadcast) with payload `{ targetType, targetId, userId, lastReadAt, lastReadMessageId }`
- No new socket events added

### Frontend Behavior

#### DMs
- On conversation open, fetches initial read receipts via GET endpoint
- Shows "Seen" with double-check icon below the last message if:
  - The last message was sent by the current user AND
  - The other user's `lastReadMessageId` matches that message
- Real-time updates via `CONVERSATION_READ` socket event

#### Channels
- Shows "Read by X" with double-check icon below the last message
- X = count of other members whose `lastReadMessageId` matches the last message
- Lightweight count only — no avatar list (mobile-friendly)

#### Throttling
- Mark-read calls are throttled: only fires when `lastMarkedReadRef` changes (prevents duplicate POST for same message)
- Read receipts query has 30s stale time
- Read receipts state resets on conversation switch

### Tests
- `server/tests/read-receipts.test.ts` — 10 tests covering:
  - Policy enforcement: unauth denied, wrong tenant denied, non-member channel denied, non-member DM denied, channel member allowed, DM member allowed
  - Storage operations: upsertChatRead for channel/DM, getConversationReadReceipts returns data, empty result handling

### Verification Checklist
- [ ] Open a DM, send a message from User A
- [ ] User B opens the DM → User A sees "Seen" below their last message
- [ ] Switch to a channel, multiple users send messages
- [ ] After other members open the channel → "Read by X" appears below the last message
- [ ] Read receipt persists on page reload (fetched from GET endpoint)
- [ ] Unread badges update correctly when conversation is marked as read
- [ ] Mobile: indicators are compact, no overflow or layout issues

---

## Chat Premium C3 — Mobile Polish

### Date: 2026-02-17

### Changes

#### ConversationListPanel (ConversationListPanel.tsx)
- **44px+ tap targets**: `min-h-[44px]` on all ChannelRow / DmRow buttons for comfortable mobile tapping
- **Unread dot indicator**: Replaced Badge unread count with a compact 2px primary dot aligned right of timestamp for cleaner list UI
- **Avatar size increase**: 32px → 36px avatars for DM rows, 36px channel icons
- **Last message preview**: Unread messages render in `text-foreground/70` (bolder), read messages in `text-muted-foreground`; "No messages yet" placeholder for channels without history
- **Timestamp alignment**: Moved to right side of header row alongside unread dot for consistent layout
- **Vertical centering**: Changed `items-start` → `items-center` for better row alignment with single-line content

#### ChatMessageTimeline (ChatMessageTimeline.tsx)
- **Inbound/outbound bubble contrast**: Own messages use `bg-primary/10 dark:bg-primary/15`, others use `bg-muted/60`; deleted messages use `bg-muted/40`
- **Bubble shape**: Progressive rounding per group position (first/middle/last) — 2xl on outer corners, md on inner corners, creating WhatsApp/iMessage-style grouping
- **Own messages right-aligned**: `flex-row-reverse` for own-user groups, avatars hidden for own messages
- **Max width constraint**: `max-width: min(85%, 560px)` prevents messages from stretching full width on desktop
- **Word break**: `word-break: break-word` + `whitespace-pre-wrap` for proper long text/URL handling
- **URL auto-linking**: `renderLinkedText()` detects `https?://` URLs and renders as styled `<a>` tags with `break-all`
- **Scroll-to-bottom FAB**: Persistent round button (bottom-right) visible whenever user scrolls up; separate pill for "New messages"
- **Mobile long-press action sheet**: 500ms touch-hold triggers full-screen action sheet with Copy, Quote, Edit, Delete, Cancel — replacing desktop-only hover dropdown menu
- **Desktop hover menu**: Preserved for non-mobile via `useIsMobile()` hook gating

### Tests
- Visual/interaction changes only — no new backend tests needed
- Existing 21 tests (11 typing + 10 read receipts) still passing

### Verification Checklist
- [ ] Open chat on mobile viewport — conversation rows have comfortable tap targets
- [ ] Unread conversations show a small dot next to timestamp
- [ ] Own messages appear right-aligned with primary-tinted bubbles
- [ ] Other users' messages appear left-aligned with muted bubbles
- [ ] Consecutive messages from same user share grouped bubble shapes (rounded corners merge)
- [ ] Long URLs in messages wrap properly and are clickable
- [ ] Scroll up in chat → round scroll-to-bottom button appears at bottom-right
- [ ] New messages arrive while scrolled up → "New messages" pill appears
- [ ] Mobile: long-press a message → action sheet slides up from bottom
- [ ] Action sheet has Copy, Quote, Edit (own only), Delete (own/admin) options
- [ ] Tapping backdrop or Cancel dismisses action sheet
- [ ] Desktop: hover over message → three-dot menu still works as before
