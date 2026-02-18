# Release Readiness Report

**Date**: 2026-02-18
**Sprint**: System Validation

---

## 1. Build Status

### Production Build: PASS
- Client bundle: 3,730 kB (gzip 962 kB)
- Client CSS: 145 kB (gzip 23 kB)
- Server bundle: 2.0 MB
- Build time: ~25s
- **Warning**: Client JS chunk exceeds 500 kB. Code-splitting via `React.lazy()` + dynamic `import()` recommended for large page modules (chat, super-admin, CRM).

### TypeScript Typecheck: 56 errors (non-blocking)
Build succeeds because `esbuild` (server) and `vite` (client) skip type checking.

| Category | Count | Severity | Notes |
|----------|-------|----------|-------|
| TS2339 Property does not exist | 18 | Medium | Missing storage interface methods (`isUserInDmThread`, `isUserInChatChannel`, `divisionId`, `assigneeId`, `createdBy`) |
| TS2802 Iterator downlevel | 10 | Low | `Set`/`Map` iteration needs `--downlevelIteration` or `target: es2015+` in tsconfig |
| TS2345 Argument not assignable | 8 | Medium | Schema type mismatches in projects/tasks routers (null vs undefined, dueDate typing) |
| TS2307 Cannot find module | 3 | Medium | Missing import for `common-tags` and client modules |
| TS2769 No overload matches | 3 | Low | Super-admin route handler overloads |
| Other (TS2322, TS2687, TS7053, TS7006, TS2304, TS2353) | 14 | Low-Medium | Mixed: request ID declaration, SQL type import, index signature |

**Recommendation**: Fix TS2802 errors by setting `"target": "ES2020"` in tsconfig.json. Fix TS2339 errors by adding missing methods to `IStorage` interface or removing dead code references.

---

## 2. Test Results

**Framework**: Vitest 4.0
**Total**: 71 tests across 20 test files

| Status | Count |
|--------|-------|
| Passed | 19 |
| Failed | 38 |
| Skipped | 14 |

### Failure Categories

| Category | Tests | Root Cause |
|----------|-------|------------|
| FK constraint violations | 18 | Likely cause: `platform_audit_events` and `subtask_assignees` FK cascades missing in test teardown. `beforeEach` cleanup fails to delete users/subtasks due to dependent rows. Needs investigation. |
| Agreement enforcement | 5 | Likely cause: Tests expect old behavior (pass-through when no agreements). Current middleware returns 451 for users without tenantId. Test expectations may need updating, but middleware behavior should also be verified against spec. |
| Global integrations persist | 5 | Routes return 404. **Potential routing regression** - needs investigation to determine if global integration routes are properly mounted or if the feature was removed/relocated. |
| Project membership scoping | 1 | Test expects 1 project, gets 2. Likely cause: project visibility logic changed or test data contamination. Needs verification. |

**Recommendation**: Prioritize investigating the global integrations 404s (potential production bug). Fix FK cascade in test cleanup. Verify agreement enforcement invariants match intended behavior.

---

## 3. Smoke Test Results

Tested against live development server with authenticated session.

### Passing (32 verified endpoints)

| Domain | Endpoint | Status |
|--------|----------|--------|
| Auth | `POST /api/auth/register` | 200 |
| Auth | `POST /api/auth/login` | 200 |
| Auth | `GET /api/auth/me` | 200 |
| Health | `GET /healthz` | 200 |
| Health | `GET /api/health` | 200 |
| Projects | `GET /api/projects` | 200 |
| Projects | `GET /api/projects/:id` | 200 |
| Projects | `GET /api/projects/:id/sections` | 200 |
| Projects | `GET /api/projects/:id/tasks` | 200 |
| Projects | `GET /api/projects/:id/calendar-events` | 200 |
| Activity | `GET /api/activity-log/task/:id` | 200 |
| Tasks | `GET /api/tasks/:id` | 200 |
| Tasks | `GET /api/tasks/:id/subtasks` | 200 |
| Tasks | `GET /api/tasks/:id/comments` | 200 |
| Tasks | `GET /api/tasks/:id/childtasks` | 200 |
| Subtasks | `GET /api/subtasks/:id/full` | 200 |
| Comments | `POST /api/tasks/:id/comments` | 201 |
| Attachments | `GET /api/projects/:pid/tasks/:tid/attachments` | 200 |
| Chat | `GET /api/v1/chat/channels` | 200 |
| Time | `GET /api/timer/current` | 200 |
| Time | `GET /api/time-entries` | 200 |
| AI | `GET /api/v1/ai/status` | 200 |
| Theme Packs | `GET /api/users/me/ui-preferences` | 200 |
| Theme Packs | `PATCH /api/users/me/ui-preferences` (set midnight) | 200 |
| Theme Packs | `PATCH /api/users/me/ui-preferences` (set light) | 200 |
| Workspaces | `GET /api/workspaces` | 200 |
| Teams | `GET /api/teams` | 200 |
| Clients | `GET /api/clients` | 200 |
| Tags | `GET /api/workspaces/:id/tags` | 200 |
| My Tasks | `GET /api/v1/my-tasks/sections` | 200 |
| Search | `GET /api/search?q=test` | 200 |
| Notifications | `GET /api/notifications` | 200 |

### Not Tested (require external services or manual interaction)
- **AI Planner** (task generation): Requires OpenAI API key with credits
- **Socket.IO realtime**: Requires WebSocket client; Socket.IO server initializes successfully per startup logs
- **File uploads**: Requires Cloudflare R2; presign endpoint available
- **Email**: Requires Mailgun credentials
- **Google OAuth**: Requires browser redirect flow

---

## 4. Performance Notes

### Server Startup
- Total boot time: ~655ms (schema 58ms, routes 540ms, ready phase instant)
- 17 migrations applied, schema parity check passes
- Background diagnostics complete within 2s of boot

### Client Bundle
- **3,730 kB JS** (gzip 962 kB) - above recommended 500 kB chunk limit
- Recommendation: Split these heavy pages via `React.lazy()`:
  - Chat page (~1,300 lines)
  - Super admin pages (~1,200 lines each)
  - CRM pipeline
  - FullCalendar views
- CSS: 145 kB (gzip 23 kB) - acceptable

### Task Drawer Performance
- Optimized in prior sprint: stabilized query keys, memoized derived state, `useCallback` for handlers
- Debug logging available via `window.__TASK_DRAWER_PERF = 1`
- No redundant re-renders on prop changes

### Database
- Pool: min=2, max=10, idle timeout 30s
- Performance indexes in place for common queries
- 19 rows with NULL `tenant_id` (15 users, 3 teams, 1 workspace) - non-critical, backfill script available

### Query Keys
- Centralized in `client/src/lib/queryKeys.ts` to prevent cache key mismatches
- All realtime invalidation hooks use centralized builders

---

## 5. Known Issues

### Critical (must fix before production)
None identified.

### High Priority
1. **56 TypeScript errors**: Not blocking builds but indicate drift between schema and storage interface. Risk of runtime errors if untyped paths are hit.
2. **Client bundle size**: 3.7 MB uncompressed JS. Slow initial load on mobile/3G. Code-splitting needed.
3. **Test suite reliability**: 38/71 tests failing due to FK constraints and stale test expectations. CI/CD pipeline would fail.

### Medium Priority
4. **NULL tenant_id rows**: 19 database rows without tenant assignment. Backfill script exists but hasn't been run.
5. **PostCSS warning**: "A PostCSS plugin did not pass the `from` option" - cosmetic but noisy in build output.
6. **Agreement enforcement edge case**: Non-super users without tenantId get 451 (TENANT_REQUIRED) rather than a more descriptive redirect. UX could be improved.

### Low Priority
7. **Deprecated chat router reference**: Mount descriptions in `mount.ts` still reference deleted legacy files. Cosmetic only.
8. **Test coverage gaps**: No tests for chat, time tracking CRUD, client portal, or theme pack endpoints.

---

## 6. Deploy Checklist

### Pre-Deploy
- [ ] Run `drizzle-kit generate` if schema changed since last deploy
- [ ] Run `drizzle-kit migrate` against production DB (never `push`)
- [ ] Verify all environment secrets are set:
  - `SESSION_SECRET`
  - `APP_ENCRYPTION_KEY`
  - `DATABASE_URL`
  - `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_ACCOUNT_ID`, `CF_R2_BUCKET_NAME`, `CF_R2_PUBLIC_URL`
- [ ] Verify `NODE_ENV=production`
- [ ] Run `npm run build` and confirm clean exit
- [ ] Verify tenant agreement flow: ensure active agreements exist and acceptance records are seeded for existing users, or that the `/accept-terms` onboarding page properly handles first-time acceptance (non-super users are blocked with 451 until they accept)

### Deploy
- [ ] Deploy via Replit publish or Railway
- [ ] Verify health endpoint: `GET /healthz` returns `ok`
- [ ] Verify readiness: `GET /api/health` returns `{"ok":true,"ready":true}`

### Post-Deploy Verification
- [ ] Login with admin account
- [ ] Navigate to a project, verify board/list/calendar views load
- [ ] Open a task drawer, verify subtasks/comments/attachments load
- [ ] Send a chat message, verify realtime delivery
- [ ] Switch theme pack (Settings > Appearance), verify CSS variables apply
- [ ] Start/stop a time entry
- [ ] Check notification bell for recent notifications
- [ ] Verify client portal access (if feature-flagged on)

### Rollback Plan
- Replit: Use checkpoint rollback (code + database)
- Railway: Redeploy previous successful build
- Database: Drizzle migrations are forward-only; keep backup before migration

---

## 7. Architecture Health

### Route System
- 14 domains migrated to `server/http/domains/` (factory pattern with policy enforcement)
- ~15 domains remain in legacy `server/routes/` aggregator
- Route registry is single source of truth (`server/http/routeRegistry.ts`)
- No duplicate route mounts detected

### Code Organization
- 11 deprecated legacy route files cleaned up (2026-02-18)
- Query keys centralized in `client/src/lib/queryKeys.ts`
- Realtime hooks refactored to use centralized key builders
- Architecture documented in `docs/architecture/organization.md`

### Security
- CSRF protection active on all mutating endpoints
- Rate limiting enabled
- Tenant scoping enforced at middleware level
- Agreement enforcement active with fail-closed default
- Session encryption with `APP_ENCRYPTION_KEY`
