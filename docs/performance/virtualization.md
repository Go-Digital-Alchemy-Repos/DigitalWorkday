# List Virtualization

## Overview

Long lists are virtualized using `react-virtuoso` to render only visible items, reducing DOM node count and improving scroll performance for large datasets.

## Feature Flag

- **Server**: `VIRTUALIZATION_V1` env var (default: `true`)
- **Config**: `config.features.virtualizationV1`
- **Client**: `useFeatureFlags().virtualizationV1`
- **Endpoint**: `GET /api/features/flags` includes `virtualizationV1`

Set `VIRTUALIZATION_V1=false` to disable and revert to standard `.map()` rendering.

## Implementation

### Shared Component

`client/src/components/ui/virtualized-list.tsx` — Generic wrapper around `<Virtuoso>` with:

- Configurable overscan (default 200px)
- Empty state support
- Header/footer slots
- Infinite scroll (`endReached`)
- Follow output for chat-like feeds

### Virtualized Views

| View | Component | Threshold | Notes |
|------|-----------|-----------|-------|
| Client Grid | `ClientGridView` in `clients.tsx` | 20 items | Grid cards rendered per-row |
| Client Table | `ClientTableView` in `clients.tsx` | 20 items | Table rows with sticky header |
| Activity Feed | `ActivityFeed` | Always | Uses VirtualizedList for all sizes |
| Chat Timeline | `ChatMessageTimeline` | Always | Uses Virtuoso directly |
| Time Tracking | `time-tracking.tsx` | Always | Uses GroupedVirtuoso |

### Threshold Strategy

Virtualization activates only when the list exceeds `VIRTUALIZATION_THRESHOLD` (20 items). Below this threshold, standard `.map()` rendering is used because:

1. Small lists don't benefit from virtualization overhead
2. DnD interactions (task lists) require all items in DOM
3. CSS grid layouts work better with static rendering at small sizes

### DnD Compatibility

Task list views use `@dnd-kit/core` with `SortableContext`, which requires all items in the DOM for drag operations. These views are **not** virtualized. The DnD constraint is documented here to prevent future attempts to virtualize drag-enabled lists.

## Libraries

| Library | Usage |
|---------|-------|
| `react-virtuoso` | Primary — `VirtualizedList`, `GroupedVirtuoso` |
| `@tanstack/react-virtual` | Installed but secondary — available for custom use cases |

## Performance Impact

Virtualization reduces DOM nodes from O(n) to O(visible + overscan). For a 500-item client list:

- Without virtualization: ~500 card/row DOM subtrees
- With virtualization: ~15-20 visible + ~5 overscan = ~25 DOM subtrees

This provides ~20x reduction in initial render cost and smooth 60fps scrolling.
