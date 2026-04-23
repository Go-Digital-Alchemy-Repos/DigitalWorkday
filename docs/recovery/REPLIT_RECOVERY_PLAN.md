# Replit Recovery Plan

## Summary

`origin/Replit` should not be merged directly into `main`.

The branch has diverged too far from the current production line:

- merge base: `4aada0b5c18fc48867690b2528d7d226d6f58728`
- unique commits: `main=28`, `origin/Replit=470`
- diff size: `569 files`, roughly `230k` insertions

This is a feature-recovery project, not a safe Git merge.

The correct strategy is:

1. keep `main` as the canonical runtime and schema baseline
2. treat `origin/Replit` as a donor branch
3. recover missing features in small, testable slices
4. never import Replit migration metadata, screenshots, prompt artifacts, or bulk docs blindly

## What To Preserve From Main

These are current-main decisions we should keep unless a specific recovery slice proves otherwise:

- current tenant-scoped route structure under `server/http/domains/*`
- current `project_manager` role restoration
- current status-driven review flow using `in_review`
- current task/subtask activity logging in `server/lib/taskActivity.ts`
- current optimistic refresh and realtime work already in progress
- current production/staging branch structure

## High-Risk Areas

These are the areas where a direct merge would be most dangerous:

- [shared/schema.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/shared/schema.ts)
- [server/storage.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/server/storage.ts)
- `migrations/meta/*`
- task drawer and subtask drawer rewrites
- query/cache infrastructure
- reports and command center surfaces

## Safe Recovery Rule

For each recovered feature, import in this order:

1. schema dependencies only if already missing
2. server route/service logic
3. client UI
4. tests
5. docs last

If `main` already has the schema or API shape, adapt the Replit feature onto current `main` instead of reviving the older Replit data model.

## Current Findings

### 1. PM review workflow is partly alive on `main`

Current `main` already contains:

- task review queue endpoint in [server/http/domains/tasks.router.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/server/http/domains/tasks.router.ts)
- PM dashboard review UI in [client/src/pages/projects-dashboard.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/pages/projects-dashboard.tsx)
- drawer review actions in:
  - [client/src/features/tasks/task-detail-drawer.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/features/tasks/task-detail-drawer.tsx)
  - [client/src/features/tasks/subtask-detail-drawer.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/features/tasks/subtask-detail-drawer.tsx)

This means we should **not** import Replit’s older `needsPmReview` workflow wholesale.

### 2. Review/history schema support already exists on `main`

Current `main` already has:

- PM review fields on tasks in [shared/schema.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/shared/schema.ts)
- `task_history` table in [shared/schema.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/shared/schema.ts)

That makes recovery easier: the DB groundwork is already present.

### 3. Replit has missing UI/service layers worth recovering

Useful donor files from `origin/Replit`:

- [client/src/components/review-queue-card.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/components/review-queue-card.tsx)
- [client/src/features/tasks/task-panel/TaskHistoryTab.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/features/tasks/task-panel/TaskHistoryTab.tsx)
- [client/src/features/tasks/task-panel/TaskPanelShell.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/features/tasks/task-panel/TaskPanelShell.tsx)
- [server/services/taskHistoryService.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/server/services/taskHistoryService.ts)
- [client/src/pages/pm-portfolio.tsx](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/client/src/pages/pm-portfolio.tsx)
- [server/http/domains/pm-portfolio.router.ts](/Users/mike/Documents/Codex%20Projects/DigitalWorkday/server/http/domains/pm-portfolio.router.ts)

## Recovery Slices

### Slice 1: Task Review UX And History

Goal:

- restore the richer task/subtask panel shell
- restore explicit history tab UI
- keep current `main` status-driven `in_review` workflow
- keep current `main` activity logging as source of truth where possible

Use from Replit:

- `TaskPanelShell`
- `TaskHistoryTab`
- `review-queue-card` patterns

Keep from Main:

- `in_review` status model
- `/api/tasks/review-queue`
- `server/lib/taskActivity.ts`
- current PM dashboard review queue endpoint and permissions

Do **not** import directly:

- old `server/http/domains/task-review.router.ts` review request/clear semantics

Compatibility rule:

- if we need a history endpoint, build it against current `task_history` / `taskActivity` usage rather than restoring the old service blindly

### Slice 2: PM Portfolio / PM Dashboard Enhancements

Goal:

- recover genuinely useful PM overview surfaces from Replit
- avoid reviving stale report infrastructure

Use from Replit:

- `pm-portfolio` page concepts
- `pm-portfolio.router.ts`

Keep from Main:

- current `/pm-dashboard` route
- current admin/project-manager access model

### Slice 3: Time Tracking And Timer UX

Goal:

- recover missing Replit improvements only after current timer stability issues are resolved

Use from Replit selectively:

- `use-active-timer.ts`
- `start-timer-drawer.tsx`
- `time-tracking.tsx`

Keep from Main:

- current subtask-aware timer assignment work
- current Railway-specific fixes

### Slice 4: Reports / Command Center

Goal:

- recover missing useful reports without reintroducing dead “control center” architecture

Use from Replit selectively:

- PM/project/client command-center cards and report ideas

Keep from Main:

- current route registry and current tenant/super routing conventions

## Files And Artifacts To Ignore

These should not be merged as part of feature recovery:

- `migrations/meta/*`
- screenshot assets
- `attached_assets/*`
- prompt and audit text files at repo root
- `Published your App` commits as recovery units
- broad docs syncs until the code has landed

## First Recovery Operation

The first implementation slice should be:

1. compare Replit `TaskPanelShell` and `TaskHistoryTab` against current drawer structure
2. adapt the parts that are purely UI/UX
3. wire them to current-main review status and current-main activity data
4. verify:
   - task drawer opens/closes cleanly
   - subtask drawer opens/closes cleanly
   - PM review queue still works
   - task history and subtask history render without reviving old watcher or control-center behavior

## Branching Note

There are local uncommitted changes in the current worktree. Before creating the dedicated recovery branch, we should either:

- commit the active local fixes, or
- shelve them intentionally

We should not branch-hop with this worktree in an ambiguous state.
