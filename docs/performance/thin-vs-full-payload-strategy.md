# Thin vs Full Payload Strategy

**Created**: March 28, 2026
**Scope**: Guidelines for choosing between thin (list-optimized) and full (detail-optimized) payloads across the application.

---

## Definitions

### Thin Payload
A server-computed projection that includes only the fields needed for a specific UI context (typically a list, table, or dropdown). Thin payloads often include pre-aggregated counts and flattened references instead of nested relation arrays.

**Characteristics:**
- Fixed, minimal column set selected at the SQL level
- Pre-aggregated counts replace nested arrays (e.g., `contactCount` instead of `contacts[]`)
- Flattened references (e.g., `projectName` instead of `project: { id, name, ... }`)
- No nested relation trees (no subtasks, comments, attachments)
- Typically 60–90% smaller than the full payload

### Full Payload
The complete entity with all nested relations loaded. Used when the user is actively viewing or editing a single record and needs access to every field and relation.

**Characteristics:**
- All columns from the primary table
- Nested relation arrays fully populated (contacts, projects, subtasks, comments, attachments)
- User objects resolved (not just IDs)
- Used for detail views, drawers, and edit forms

---

## Where Each Is Used

### Thin Payloads in the Current Codebase

| DTO | Endpoint | Used By | Key Fields Included | Fields Excluded |
|-----|----------|---------|--------------------|--------------------|
| `ClientListItem` | `GET /api/v1/clients/hierarchy/list` | Clients list page | id, companyName, displayName, status, stage, industry, tags, email, phone, website, parentClientId, depth, parentName, contactCount, projectCount, openTasksCount, totalHoursWorked, lastActivityAt, needsAttention, createdAt | notes, description, addresses, contacts[], projects[] |
| `fields=minimal` clients | `GET /api/clients?fields=minimal` | Project filter dropdowns | id, companyName, displayName, status, parentClientId | Everything else |
| `ProjectWithCounts` | `GET /api/projects?fields=minimal&includeCounts=true` | Projects dashboard | id, name, clientId, status, dates, color, teamId, stickyAt, visibility, description, taskCounts { total, completed } | sections[], members[], team, client relations |
| `TaskListItem` | `GET /api/tasks/my?view=list` | My Tasks list | id, title, status, priority, dueDate, dueBucket, projectId, projectName, projectColor, clientName, isPersonal, assignees (userId+name), tags (id+name), commentCount, subtaskCount, subtaskCompletedCount, createdAt, updatedAt | comments[], subtasks[], attachments[], full assignee User objects, full tag objects |
| Stage summary | `GET /api/v1/clients/stages/summary` | Clients pipeline bar | stage, clientCount, projectCount | N/A (aggregate endpoint) |

### Full Payloads in the Current Codebase

| DTO | Endpoint | Used By | Trigger |
|-----|----------|---------|---------|
| `ClientWithContacts` | `GET /api/clients/:id` | Client detail page, ClientDetailSheet | User clicks a client row/card |
| `ProjectWithRelations` | `GET /api/projects/:id` | Project detail page | User navigates to project |
| `TaskWithRelations` | `GET /api/tasks/:id` | TaskDetailDrawer | User clicks a task row |

---

## How Developers Should Choose

### Decision Tree

```
Is this a list, table, grid, or dropdown?
  YES → Use a thin payload
    Does the list need aggregate counts (task count, contact count)?
      YES → Include pre-aggregated counts in the thin DTO
      NO  → Use the minimal field set
  NO → Is this a detail view, drawer, or edit form?
    YES → Use the full payload, loaded lazily on interaction
    NO  → Is this a dashboard summary or analytics card?
      YES → Use a dedicated aggregate endpoint (SQL GROUP BY)
      NO  → Evaluate on a case-by-case basis
```

### Key Principles

1. **List views never load relation arrays.** Use counts instead of arrays. `contactCount: 5` not `contacts: [{...}, {...}, ...]`.

2. **Full payloads are always deferred to interaction.** The user must take an action (click, open drawer) before the full payload is fetched. Use `useQuery` with `enabled: open && !!id`.

3. **Dropdowns use the slimmest payload available.** A dropdown selecting a client needs only `{ id, companyName, displayName, status }`. Use `?fields=minimal` or an equivalent query parameter.

4. **Counts and aggregates are SQL-first.** Don't fetch 100 records and count them client-side. Use `COUNT(*)`, `GROUP BY`, or `SUM()` at the database level.

5. **Separate query keys for each payload shape.** Thin and full payloads must have distinct cache keys so they don't overwrite each other:
   - `queryKeys.clients.hierarchy` → thin list
   - `queryKeys.clients.detail(id)` → full detail
   - `queryKeys.clients.minimal` → dropdown-only fields

---

## Anti-Patterns

### 1. Fetching Full Payloads for Lists
```typescript
// BAD: Fetches full ClientWithContacts[] for a list view
const { data } = useQuery({ queryKey: ["/api/clients"] });
```
```typescript
// GOOD: Fetches thin ClientListItem[] for a list view
const { data } = useQuery({ queryKey: queryKeys.clients.hierarchy });
```

### 2. Client-Side Aggregation from Full Datasets
```typescript
// BAD: Fetch all clients, then count by stage in JS
const allClients = await fetchAllClients();
const stageCounts = allClients.reduce((acc, c) => { ... }, {});
```
```typescript
// GOOD: Server-side SQL aggregate
const stageCounts = await fetchStagesSummary(); // SQL GROUP BY
```

### 3. Eager Loading Detail Data
```typescript
// BAD: Fetch full task details for every task on mount
const { data } = useQuery({
  queryKey: ["/api/tasks", taskId],
}); // fires immediately
```
```typescript
// GOOD: Defer full fetch to user interaction
const { data } = useQuery({
  queryKey: queryKeys.tasks.detail(taskId),
  enabled: drawerOpen && !!taskId, // only when drawer opens
});
```

### 4. Sharing Cache Keys Between Payload Shapes
```typescript
// BAD: Same key for different shapes causes cache corruption
useQuery({ queryKey: ["/api/clients"] }); // returns full objects in one place
useQuery({ queryKey: ["/api/clients"] }); // expects minimal objects elsewhere
```
```typescript
// GOOD: Distinct keys per shape
useQuery({ queryKey: queryKeys.clients.all });     // full
useQuery({ queryKey: queryKeys.clients.minimal });  // slim
useQuery({ queryKey: queryKeys.clients.hierarchy }); // hierarchy list
```

### 5. Adding Nested Relations to Thin DTOs
```typescript
// BAD: Adding contacts[] to ClientListItem "for convenience"
type ClientListItem = {
  id: string;
  companyName: string;
  contacts: Contact[]; // defeats the purpose of thin payload
};
```
```typescript
// GOOD: Use a count field instead
type ClientListItem = {
  id: string;
  companyName: string;
  contactCount: number; // pre-aggregated in SQL
};
```

---

## Adding a New Thin Payload

When adding a new list or table view, follow this checklist:

1. **Define the thin DTO** in `shared/schema.ts` with only the fields the list UI renders.
2. **Add pre-aggregated counts** for any relations the UI shows as badges or indicators.
3. **Create a dedicated endpoint** or add a `?fields=` parameter to an existing one.
4. **Register a query key** in `client/src/lib/queryKeys.ts` distinct from the full payload key.
5. **Use `enabled` guards** on any detail queries so they only fire on user interaction.
6. **Add the query key prefix** to `TENANT_SCOPED_QUERY_PREFIXES` in `queryClient.ts` if it's tenant-scoped.
