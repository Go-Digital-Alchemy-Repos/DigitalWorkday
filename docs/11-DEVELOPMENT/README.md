# Development

**Status:** Current  
**Last Updated:** March 2026

This section covers development practices, coding standards, and workflows.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Code style and conventions |
| [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Branching and commits |
| [PULL_REQUESTS.md](./PULL_REQUESTS.md) | PR guidelines |
| [DEBUGGING.md](./DEBUGGING.md) | Debugging techniques |
| [PERFORMANCE.md](./PERFORMANCE.md) | Performance optimization |
| [ADDING_FEATURES.md](./ADDING_FEATURES.md) | How to add new features |

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (local or DATABASE_URL)
- Git

### Quick Start

```bash
npm install
npm run dev
```

Server runs at `http://localhost:5000`

---

## Code Organization

### Frontend

```
client/src/
├── pages/        # Route components (one per route)
├── components/   # Reusable components
├── hooks/        # Custom React hooks
└── lib/          # Utilities
```

### Backend

```
server/
├── routes/       # API route handlers
├── middleware/   # Express middleware
├── services/     # Business logic
└── scripts/      # Maintenance scripts
```

### Shared

```
shared/
└── schema.ts     # Drizzle schema + types
```

---

## Adding a New Feature

### 1. Define Schema

Add tables/columns to `shared/schema.ts`:

```typescript
export const myFeature = pgTable("my_feature", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 256 }).notNull(),
});

export const insertMyFeatureSchema = createInsertSchema(myFeature).omit({
  id: true,
});
```

### 2. Add Storage Methods

Update `server/storage.ts`:

```typescript
async getMyFeatures(tenantId: string) {
  return db.query.myFeature.findMany({
    where: eq(myFeature.tenantId, tenantId),
  });
}
```

### 3. Create API Endpoints

Add routes to `server/routes.ts` or create new file in `server/routes/`:

```typescript
app.get('/api/my-feature', requireAuth, async (req, res) => {
  const items = await storage.getMyFeatures(req.tenant.effectiveTenantId!);
  res.json(items);
});
```

### 4. Build UI

Create page in `client/src/pages/` and components in `client/src/components/`.

### 5. Update Docs

Add feature to relevant documentation files.

---

## Coding Conventions

### TypeScript

- Strict mode enabled
- Use explicit types for function returns
- Prefer interfaces over type aliases

### React

- Functional components only
- Use TanStack Query for server state
- Follow shadcn/ui patterns

### API

- RESTful conventions
- Consistent error responses
- Zod validation on all inputs

---

## Debugging

### Frontend

```typescript
// React Query DevTools (development only)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
```

### Backend

```typescript
// Add debug logging
console.log('[debug]', { tenantId, userId, action });
```

### Database

```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM tasks WHERE tenant_id = '...';
```

---

## TypeScript Stabilization Status

**Baseline**: 0 errors (as of Task #64, March 2026)

| Item | Value |
|------|-------|
| Compiler target | ES2022 |
| Strict mode | Enabled |
| Error count | 0 |
| Check command | `npm run check` (runs `tsc --noEmit`) |

### Fixes Applied (Task #64)
1. **`client/src/features/tasks/task-detail-drawer.tsx`** — Narrowed `commentsKey` type to `readonly string[]` in the `onMutate` callback so it matches the `onError` context type. The query key values are all strings at runtime (`tenantKey` prepends `["tenant", tenantId, ...]`).
2. **`server/index.ts`** — Changed `log(...)` to `log.info(...)` on the boot message to match the structured logger API returned by `createLogger`.

### Prior Bulk Cleanup (Task #41)
Resolved the majority of TypeScript errors across the codebase (schema drift, missing imports, duplicate implementations, Set iteration issues resolved by ES2022 target).

### Type Safety Policy
- No `any` casts, `ts-ignore`, or unsafe assertions were added
- All fixes use proper type narrowing
- The zero-error baseline should be maintained for all future work

### Typecheck Enforcement (Task #65, March 2026)

**Enforcement Points:**

| Gate | Location | Mechanism |
|------|----------|-----------|
| Post-merge | `scripts/post-merge.sh` | Runs `npm run check` after `npm install`; `set -e` aborts on failure |
| Production build | `script/build.ts` | Runs `tsc --noEmit` before client/server bundling; build aborts on failure |

**Zero-Error Baseline:** Established March 2026. The codebase compiles with zero TypeScript errors under strict mode.

**Expectations for Future Work:**
- All new code must pass `npm run check` with zero errors before merge
- No `@ts-ignore`, `@ts-expect-error`, or blanket `any` casts to suppress errors
- Type regressions introduced by new features must be fixed in the same change

---

## Related Sections

- [02-ARCHITECTURE](../02-ARCHITECTURE/) - System design
- [09-TESTING](../09-TESTING/) - Testing practices
- [04-API](../04-API/) - API conventions
