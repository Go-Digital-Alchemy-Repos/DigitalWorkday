# Frontend Import Conventions

## Rule: Avoid Barrel Imports in Pages and Components

**Do not** import heavy or drawer-type components from feature barrel files (`index.ts`). Instead, import directly from the source module.

### Why

Barrel re-exports (`export * from "./foo"` or `export { Foo } from "./foo"` in `index.ts`) create a single module node that Rollup/Vite must treat as depending on every re-exported module. When two feature domains reference each other through barrels, this creates **circular chunk dependencies** that:

1. Produce build warnings ("will end up in different chunks … circular dependency between chunks … broken execution order")
2. Can cause runtime errors from undefined imports during initialization
3. Prevent Rollup from splitting chunks effectively, inflating bundle sizes

### What Goes in a Barrel (`index.ts`)

Only small, stable, frequently-imported items:

- Lightweight UI components (cards, badges, list items)
- Types and interfaces
- Constants and configuration

### What Does NOT Go in a Barrel

- Large drawer/dialog components (e.g., `TaskDetailDrawer`, `StartTimerDrawer`)
- Components that import from other feature domains
- Components with heavy dependency trees (rich text editors, calendars, etc.)

### Import Pattern

```typescript
// GOOD: Direct import for heavy components
import { TaskDetailDrawer } from "@/features/tasks/task-detail-drawer";
import { StartTimerDrawer } from "@/features/timer/start-timer-drawer";
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";

// GOOD: Barrel import for lightweight components
import { TaskCard, SortableTaskCard } from "@/features/tasks";
import { CreateProjectDialog } from "@/features/projects";

// BAD: Importing heavy components through barrel
import { TaskDetailDrawer } from "@/features/tasks";
import { StartTimerDrawer } from "@/features/timer";
```

### Cross-Feature Imports

When one feature component needs to import from another feature domain (e.g., `task-detail-drawer` importing `StartTimerDrawer`), **always use the direct path**:

```typescript
// Inside features/tasks/task-detail-drawer.tsx
import { StartTimerDrawer } from "@/features/timer/start-timer-drawer";

// Inside features/timer/start-timer-drawer.tsx
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";
```

This breaks the barrel-level cycle that would otherwise exist between `@/features/tasks` and `@/features/timer`.

### Current Barrel Structure

| Barrel | Exports | Notes |
|---|---|---|
| `features/tasks/index.ts` | TaskCard, SortableTaskCard, SectionColumn, ListSectionDroppable, SubtaskList, ChildTaskList, CreateTaskDialog | Light board/list components only |
| `features/timer/index.ts` | GlobalActiveTimer, MobileActiveTimerBar | Layout-level timer UI only |
| `features/projects/index.ts` | All project drawers/sheets/dialogs | No cross-feature imports |
| `features/clients/index.ts` | ClientDrawer, ClientProfileDrawer, DivisionDrawer | No cross-feature imports |
| `features/teams/index.ts` | TeamDrawer | Single export |
| `features/chat/index.ts` | Chat hooks, panels, types | No cross-feature imports |
| `features/index.ts` | Re-exports clients, projects, teams | Excludes tasks/timer to avoid pulling heavy graphs |

### Verification

Run `npx vite build 2>&1 | grep -i circular` to confirm zero circular chunk warnings.
