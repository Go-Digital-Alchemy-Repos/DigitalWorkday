# Oversized File Audit — Refactor Sprint

**Date**: 2026-02-19
**Author**: Automated Audit

---

## Phase 0 — Baseline Results

| Check          | Result                | Notes                                       |
|----------------|----------------------|---------------------------------------------|
| TypeScript     | 21 errors (pre-existing) | TS2802 (downlevelIteration), TS2339 (missing props), TS2393 (duplicate impls) |
| Vite Build     | ✅ Success (25.17s)   | Largest chunk: skip-link 1,128 kB gzip 323 kB |
| Test Suite     | 80 test files present | server/tests/*.test.ts                      |
| Server Start   | ✅ Runs cleanly       | Schema checks pass, SLA evaluator scheduled |

---

## Phase 1 — Top 30 Oversized Files

### Thresholds

| Category                | Threshold (lines) |
|------------------------|--------------------|
| Server routes/controllers | > 400             |
| Services                | > 350             |
| Repos                  | > 300             |
| React pages/components  | > 400             |

### Server Files

| # | Path | Lines | Category | Risk | Recommended Split |
|---|------|-------|----------|------|-------------------|
| 1 | `server/storage.ts` | 5,131 | Repo (monolith) | **HIGH** | Split by domain: clients, support, chat, users, projects, notifications, tenancy |
| 2 | `server/auth.ts` | 1,735 | Service | HIGH | Extract strategies, middleware, session helpers |
| 3 | `server/routes/modules/super-admin/tenant-users.router.ts` | 1,422 | Route | MED | Split: CRUD, invites, impersonation, audit |
| 4 | `server/http/domains/chat.router.ts` | 1,296 | Route | HIGH | Split: channels, messages, DMs, typing |
| 5 | `server/routes/tenancyHealth.ts` | 1,152 | Route | MED | Slim to thin controller, push logic to service |
| 6 | `server/http/domains/time.router.ts` | 1,152 | Route | MED | Split: timers, entries, reports, calendar |
| 7 | `server/routes/tenantOnboarding.ts` | 984 | Route | LOW | Extract wizard steps to service |
| 8 | `server/services/tenancyHealth.ts` | 932 | Service | MED | Already service; consolidate with route |
| 9 | `server/routes/clients.router.ts` | 932 | Route (legacy) | MED | Migrate to createApiRouter, extract services |
| 10 | `server/http/domains/tasks.router.ts` | 877 | Route | MED | Split: CRUD, assignees, watchers, personal sections |
| 11 | `server/storage/tasks.repo.ts` | 873 | Repo | LOW | Acceptable for complexity |
| 12 | `server/imports/importEngine.ts` | 857 | Service | LOW | Complex but cohesive; no split needed |
| 13 | `server/routes/users.router.ts` | 827 | Route (legacy) | MED | Split: profile, preferences, password, avatar |
| 14 | `server/services/tenantIntegrations.ts` | 812 | Service | MED | Has duplicate function impls (TS error) |
| 15 | `server/routes/crm.router.ts` | 800 | Route (legacy) | MED | Consolidate with clients or migrate to domain |
| 16 | `server/routes/systemStatus.ts` | 792 | Route | LOW | Admin-only; acceptable |
| 17 | `server/routes/modules/super-admin/export-import.router.ts` | 775 | Route | LOW | Complex but cohesive |
| 18 | `server/http/domains/projects.router.ts` | 768 | Route | MED | Split: CRUD, members, settings, templates |
| 19 | `server/http/domains/support.router.ts` | 723 | Route | LOW | Recently split; acceptable |
| 20 | `server/routes/tenantData.ts` | 720 | Route | LOW | Data export; cohesive |

### Client Files

| # | Path | Lines | Category | Risk | Recommended Split |
|---|------|-------|----------|------|-------------------|
| 21 | `client/src/components/super-admin/tenant-drawer.tsx` | 5,090 | Component | **HIGH** | Split into tab sub-components (billing, users, settings, provisioning) |
| 22 | `client/src/pages/super-admin-status.tsx` | 3,478 | Page | HIGH | Extract health, tenancy, incident, actions sections |
| 23 | `client/src/pages/chat.tsx` | 2,808 | Page | HIGH | Extract panels, hooks, message list into features/chat |
| 24 | `client/src/pages/super-admin-settings.tsx` | 2,566 | Page | MED | Extract setting groups into tab components |
| 25 | `client/src/pages/super-admin-users.tsx` | 2,326 | Page | MED | Extract user table, filters, dialogs |
| 26 | `client/src/pages/client-detail.tsx` | 2,241 | Page | MED | Extract tab panels (notes, docs, contacts, invoices) |
| 27 | `client/src/pages/time-tracking.tsx` | 1,878 | Page | MED | Extract timer, entries list, reports sub-components |
| 28 | `client/src/pages/client-360.tsx` | 1,849 | Page | MED | Extract summary cards, activity feed, metrics |
| 29 | `client/src/pages/clients.tsx` | 1,761 | Page | LOW | Extract table, filters, dialogs |
| 30 | `client/src/features/tasks/task-detail-drawer.tsx` | 1,503 | Component | MED | Extract sub-sections (comments, attachments, activity) |

### Shared Files

| Path | Lines | Category | Risk | Notes |
|------|-------|----------|------|-------|
| `shared/schema.ts` | 3,495 | Schema | LOW | Monolith but rarely edited per-domain; split not priority |
| `shared/events/index.ts` | 905 | Types | LOW | Event constants; cohesive |

---

## Sprint Target: Top 10 Files to Refactor

**Priority order** (by impact × risk):

| Priority | File | Action |
|----------|------|--------|
| P0 | `server/storage.ts` (5,131) | Extract domain repos: support, chat, users, notifications |
| P0 | `client/src/components/super-admin/tenant-drawer.tsx` (5,090) | Split into tab sub-components |
| P1 | `client/src/pages/super-admin-status.tsx` (3,478) | Extract section components |
| P1 | `server/http/domains/chat.router.ts` (1,296) | Split channels/messages/DMs |
| P1 | `server/http/domains/time.router.ts` (1,152) | Split timers/entries/reports |
| P1 | `client/src/pages/chat.tsx` (2,808) | Extract hooks and sub-panels |
| P2 | `server/http/domains/tasks.router.ts` (877) | Split CRUD/assignees/watchers |
| P2 | `server/routes/clients.router.ts` (932) | Migrate to createApiRouter |
| P2 | `client/src/pages/super-admin-settings.tsx` (2,566) | Extract setting tab components |
| P2 | `client/src/pages/super-admin-users.tsx` (2,326) | Extract table/dialog components |

---

## Architecture Conventions

### Server Convention (target)
```
server/
  http/
    domains/           # createApiRouter routers (new style)
      <domain>.router.ts
      <domain>/        # sub-routers if file > 400 lines
    middleware/
    routeRegistry.ts
    routerFactory.ts
  features/
    <domain>/
      <domain>.service.ts
      <domain>.repo.ts
  storage/
    <domain>.repo.ts   # domain-specific DB repos
    index.ts           # IStorage aggregator
  routes/
    domains/           # legacy routers (migration in progress)
    index.ts           # thin aggregator
```

### Client Convention (target)
```
client/src/
  features/
    <domain>/
      hooks/           # React Query hooks
      components/      # Domain-specific components
  pages/               # Page-level components (thin shells)
  components/          # Shared UI components
  lib/
    queryKeys/         # Centralized query key builders
```

---

## Performance Targets

| Area | Pattern | Fix |
|------|---------|-----|
| Chat messages | Per-message author lookup | Batch user lookup with IN clause |
| Task lists | Per-task assignee/tag resolution | Join or batch fetch |
| Client lists | Per-client project/contact counts | Aggregate queries |
| Support tickets | Per-ticket SLA policy lookup | Cache policies per tenant |
| Time entries | Per-entry project/task resolution | Join in query |

---

## Risk Notes

- `server/storage.ts` extraction is highest-risk: touches every domain. Must preserve IStorage interface.
- Frontend splits are lower-risk: component extraction with props pass-through.
- All splits must preserve existing import paths or update all consumers.
- No DB schema changes allowed this sprint.
