# Tenancy Model

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Tenant Data Visibility](../security/TENANT_DATA_VISIBILITY.md), [Effective Tenant Context](./EFFECTIVE_TENANT_CONTEXT.md)

---

## Overview

MyWorkDay uses a **single-database multi-tenancy** model where all tenants share the same database, with data isolation enforced through `tenant_id` columns on every tenant-owned table.

---

## Core Invariants

### 1. Every Tenant-Owned Entity Has tenant_id

All tables that contain tenant-specific data MUST have a `tenant_id` column:

```typescript
// CORRECT: Table has tenant_id
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name").notNull(),
  // ...
});
```

### 2. Every Query Filters by effectiveTenantId

All data access MUST include tenant filtering:

```typescript
// CORRECT: Query includes tenant filter
const projects = await db.select()
  .from(schema.projects)
  .where(eq(schema.projects.tenantId, effectiveTenantId));

// WRONG: Missing tenant filter - exposes all tenant data!
const projects = await db.select().from(schema.projects);
```

### 3. Workspace is Organizational, NOT a Visibility Boundary

Workspaces exist for organization within a tenant. They are NOT visibility boundaries:

```typescript
// WRONG: Using workspace as visibility filter
const clients = await db.select()
  .from(schema.clients)
  .where(eq(schema.clients.workspaceId, workspaceId));

// CORRECT: Using tenant_id for visibility
const clients = await db.select()
  .from(schema.clients)
  .where(eq(schema.clients.tenantId, effectiveTenantId));
```

---

## Tenant Hierarchy

```
Tenant
├── Users (tenant admins, employees)
├── Workspaces (organizational grouping)
│   ├── Projects
│   │   ├── Sections
│   │   ├── Tasks
│   │   └── Project Members
│   ├── Clients
│   │   ├── Contacts
│   │   └── Client Divisions
│   └── Teams
├── Chat Channels
├── DM Threads
└── Integrations
```

---

## Visibility Rules

| Entity | Visibility | Filter Column |
|--------|------------|---------------|
| Users | Tenant-wide | `tenant_id` |
| Clients | Tenant-wide | `tenant_id` |
| Projects | Tenant-wide (admins) / Member-scoped (employees) | `tenant_id` + membership |
| Tasks | Project-scoped | Via project's `tenant_id` |
| Time Entries | Tenant-wide (admins) / Own (employees) | `tenant_id` + `user_id` |
| Chat Channels | Tenant-wide (visible) / Member (participation) | `tenant_id` |
| DMs | Member only | `tenant_id` + membership |

---

## Primary Workspace Pattern

Every tenant has a **primary workspace** created during tenant setup:

```typescript
// All provisioning flows use this helper
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

// Creates entities in the correct workspace
await db.insert(schema.clients).values({
  tenantId,
  workspaceId: primaryWorkspaceId,
  // ...
});
```

If no primary workspace exists, the helper throws an explicit error with request ID correlation for debugging.

---

## What NOT to Do

### Never Use Workspace for Visibility
```typescript
// WRONG
.where(eq(table.workspaceId, workspaceId))

// CORRECT
.where(eq(table.tenantId, tenantId))
```

### Never Skip Tenant Filter
```typescript
// WRONG - Returns data from ALL tenants
const allProjects = await db.select().from(projects);

// CORRECT
const tenantProjects = await db.select()
  .from(projects)
  .where(eq(projects.tenantId, tenantId));
```

### Never Trust Client-Provided Tenant ID
```typescript
// WRONG - Trust user input
const tenantId = req.body.tenantId;

// CORRECT - Use authenticated context
const tenantId = req.user.effectiveTenantId;
```

---

## Related Documentation

- [Effective Tenant Context](./EFFECTIVE_TENANT_CONTEXT.md) - How tenant context is determined
- [Tenant Data Visibility](../security/TENANT_DATA_VISIBILITY.md) - Detailed visibility rules
- [Multi-Tenancy Security](../security/MULTI_TENANCY.md) - Security enforcement
