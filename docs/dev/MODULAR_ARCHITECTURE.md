# Modular Architecture

**Status:** Current  
**Last Updated:** January 2026

This document describes the feature-based modular architecture introduced in Phase D to improve code organization and maintainability.

## Overview

Both server and client codebases are organized into feature-based modules that group related functionality together. This promotes:

- **Co-location**: Related code lives together
- **Encapsulation**: Features have clear boundaries
- **Discoverability**: Easy to find code by feature
- **Testability**: Features can be tested in isolation

## Server Features (`server/features/`)

### Structure

```
server/features/
├── clients/           # Client CRM feature
│   ├── router.ts      # Main routes
│   ├── divisions.router.ts  # Sub-feature routes
│   ├── index.ts       # Barrel export
│   └── README.md      # Feature documentation
├── projects/          # (planned)
├── tasks/             # (planned)
├── teams/             # (planned)
├── timer/             # (planned)
└── index.ts           # Aggregates all features
```

### Route Mounting

Features are mounted at `/api` in `server/routes/index.ts`:

```typescript
import featuresRoutes from "../features";
router.use(featuresRoutes);
```

Feature routes take precedence over legacy routes, enabling incremental migration.

### Adding a Server Feature

1. Create feature directory: `server/features/{name}/`
2. Create `router.ts` with Express Router
3. Create `index.ts` exporting the router
4. Add README.md documenting the feature
5. Import in `server/features/index.ts`
6. Test and verify
7. Remove corresponding routes from `routes.ts`

## Client Features (`client/src/features/`)

### Structure

```
client/src/features/
├── clients/           # Client management
│   ├── client-drawer.tsx
│   ├── division-drawer.tsx
│   └── index.ts
├── projects/          # Project management
│   ├── project-drawer.tsx
│   ├── project-detail-drawer.tsx
│   ├── project-calendar.tsx
│   └── index.ts
├── tasks/             # Task management
│   ├── task-detail-drawer.tsx
│   ├── task-card.tsx
│   ├── section-column.tsx
│   └── index.ts
├── timer/             # Time tracking
│   ├── start-timer-drawer.tsx
│   ├── global-active-timer.tsx
│   └── index.ts
├── teams/             # Team management
│   ├── team-drawer.tsx
│   └── index.ts
└── index.ts           # Barrel export
```

### Import Patterns

```tsx
// Import from specific feature
import { ClientDrawer } from "@/features/clients";
import { TaskCard, TaskDetailDrawer } from "@/features/tasks";

// Internal feature imports use relative paths
import { TaskCard } from "./task-card";  // within tasks/

// Cross-feature imports use barrel exports
import { StartTimerDrawer } from "@/features/timer";
```

### What Stays in /components

- `ui/` - Base shadcn components
- Layout components (sidebars, navigation)
- Utility components (badges, avatars)
- Truly cross-cutting components

## Migration Status

| Feature | Server | Client |
|---------|--------|--------|
| Clients | ✅ Extracted | ✅ Extracted |
| Projects | 🔜 Planned | ✅ Extracted |
| Tasks | 🔜 Planned | ✅ Extracted |
| Teams | 🔜 Planned | ✅ Extracted |
| Timer | 🔜 Planned | ✅ Extracted |

## Related Documentation

- [Server Features README](../../server/features/README.md)
- [Client Features README](../../client/src/features/README.md)
