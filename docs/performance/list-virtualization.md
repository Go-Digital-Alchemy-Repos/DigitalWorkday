# List Virtualization Audit & Implementation

## Audit Results (Feb 2026)

| List | Typical Row Count | Current Strategy | Action Taken |
|---|---|---|---|
| Chat messages | 100–1000+ | Virtualized (react-virtuoso `Virtuoso`) | Already done |
| Activity feed | 10–200 | Virtualized (`VirtualizedList` wrapper) | Already done |
| Notification center | 10–100 | Virtualized (`VirtualizedList` wrapper) | Already done |
| **Time entries** | **50–500+** | **`.map()` flat render** | **Virtualized with `GroupedVirtuoso`** |
| **My Tasks sections** | **5–100+** | **`.map()` per section** | **Progressive disclosure (show 20, expand)** |
| Project board columns | 5–50 per column | DnD columns with `.map()` | No action (DnD incompatible, column counts manageable) |
| Project list view | 10–50 | Table rows via `.map()` | No action (manageable count) |

## Implementation Details

### Time Entries (GroupedVirtuoso)

**File:** `client/src/pages/time-tracking.tsx`

- Uses `GroupedVirtuoso` from `react-virtuoso` for day-grouped time entries
- **Threshold:** Virtualization activates when total entries exceed 30 (`VIRTUALIZE_THRESHOLD`)
- Below threshold: renders the same flat `.map()` for simplicity and DX
- **Group headers:** Sticky day headers (managed by Virtuoso internally) with date and total duration badge
- **Item height:** Auto-measured by Virtuoso (variable height rows supported)
- **Overscan:** 200px for smooth scrolling
- **Container height:** Viewport-relative, `min(60vh, 600px)` — Virtuoso manages variable row heights within this fixed container
- Preserves all existing UX: edit/delete dropdowns, scope badges, client/project labels

### My Tasks Sections (Progressive Disclosure)

**File:** `client/src/pages/my-tasks.tsx`

- Each task section (Overdue, Today, Upcoming, Personal, No Due Date) initially shows up to 20 tasks (`SECTION_INITIAL_SHOW`)
- "Show N more tasks" button appears when section exceeds threshold
- "Show fewer tasks" button to collapse back
- DnD `SortableContext` uses `visibleTasks` — drag-and-drop operates on visible items only
- When expanded ("Show all"), DnD covers all items in the section
- Full task count always shown in section header badge

## Design Decisions

### Why Not Virtualize My Tasks?

My Tasks uses `@dnd-kit/core` with `SortableContext` which requires all sortable items in the DOM with measurable rects. Virtualizing a DnD-sortable list would break drag-and-drop or require a complex custom integration. Progressive disclosure (show first 20, expand on demand) achieves the same render reduction while maintaining DnD integrity on visible items.

### Why Not Virtualize Project Board?

Board view renders tasks in columns (sections). Each column typically has 5–30 tasks. The column layout with DnD makes virtualization impractical and the per-column counts don't warrant it.

### Threshold Strategy

Virtualization adds complexity (container height management). For lists under ~30 items, the overhead isn't justified. The threshold ensures small lists render with zero abstraction cost.

### DnD + Progressive Disclosure

When a My Tasks section is collapsed (showing first 20), `SortableContext` only contains the visible items. Users can reorder within the visible set. To reorder across all items, users expand the section first. This is intentional — reordering items you can't see is not a meaningful UX interaction.

## Dependencies

- `react-virtuoso` (already installed, used by chat and notification center)
- `@tanstack/react-virtual` (installed but not used for this work; available for future use)

## Verification Checklist

### Time Entries
- [ ] Navigate to Time Tracking page
- [ ] Set date filter to "All Time" or "This Month" to get 30+ entries
- [ ] Confirm entries render within a scrollable container (not full page height)
- [ ] Scroll through entries — should be smooth with no jank
- [ ] Verify sticky day headers remain visible while scrolling within a group (Virtuoso handles this)
- [ ] Click the "..." menu on an entry — Edit and Delete should work
- [ ] Add a manual entry — it should appear in the list
- [ ] Delete an entry — it should disappear from the list
- [ ] Switch date filter — list should update correctly
- [ ] With fewer than 30 entries (e.g., "Today"), confirm flat non-virtualized render

### My Tasks
- [ ] Navigate to My Tasks page
- [ ] If a section has >20 tasks, confirm "Show N more tasks" button appears
- [ ] Click "Show N more tasks" — remaining tasks should appear
- [ ] Click "Show fewer tasks" — list should collapse back to 20
- [ ] Drag and drop a task within the visible set — should work normally
- [ ] Expand all tasks, drag and drop — should work across full list
- [ ] Section header badge should show total count (not truncated count)
- [ ] Expand all tasks, then collapse section via collapsible trigger — should work

### Mobile
- [ ] Time entries: scrollable container works on small screens
- [ ] My Tasks: show more/less buttons are tappable and accessible
- [ ] No horizontal overflow introduced

### Performance
- [ ] With 100+ time entries: initial render should be fast (<200ms)
- [ ] Scrolling through virtualized list: smooth 60fps
- [ ] Memory usage should not grow unbounded during scroll
