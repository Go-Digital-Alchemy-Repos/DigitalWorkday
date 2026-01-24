# Development Checklist

**Status:** Current  
**Last Updated:** January 2026  
**Purpose:** Verification checklist for every new feature or change

---

## Before Starting

- [ ] Read [Tenancy Model](../architecture/TENANCY_MODEL.md)
- [ ] Read [Tenant Data Visibility](../security/TENANT_DATA_VISIBILITY.md)
- [ ] Understand which tenant-owned entities you're touching

---

## New Database Table

When adding a new table:

- [ ] **Does it need tenant_id?**
  - If the data belongs to a specific tenant: YES
  - If it's system-wide configuration: NO
  
- [ ] **Is tenant_id enforced on insert?**
  ```typescript
  await db.insert(newTable).values({
    tenantId: effectiveTenantId,  // Must be set!
    // ...
  });
  ```

- [ ] **Are queries filtered by tenant_id?**
  ```typescript
  .where(eq(table.tenantId, effectiveTenantId))
  ```

- [ ] **Is the table in the tenant-owned tables list?**
  - Update `server/scripts/tenantOwnedTables.ts` if needed

---

## New List Endpoint

When adding a new list/query endpoint:

- [ ] **Is it tenant-scoped, NOT workspace-scoped?**
  ```typescript
  // CORRECT
  .where(eq(table.tenantId, effectiveTenantId))
  
  // WRONG - workspace is not a visibility boundary
  .where(eq(table.workspaceId, workspaceId))
  ```

- [ ] **Does it use effectiveTenantId from auth context?**
  ```typescript
  const effectiveTenantId = getEffectiveTenantId(req);
  ```

- [ ] **Are related entities fetched with tenant filter?**

---

## New Create/Update Endpoint

When adding a mutation endpoint:

- [ ] **Is tenant_id set on insert?**
  ```typescript
  tenantId: effectiveTenantId,
  ```

- [ ] **Is the entity validated to belong to tenant before update?**
  ```typescript
  const entity = await getById(id);
  if (entity.tenantId !== effectiveTenantId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  ```

- [ ] **Is there audit logging for sensitive operations?**
  ```typescript
  await recordTenantAuditEvent(tenantId, "entity_created", ...);
  ```

---

## New Upload Feature

When adding file upload functionality:

- [ ] **Does it use the storage resolver?**
  ```typescript
  const config = await getStorageConfig(tenantId);
  ```

- [ ] **Is the path tenant-scoped?**
  ```typescript
  const key = `uploads/${tenantId}/${category}/${filename}`;
  ```

- [ ] **Are credentials never exposed to client?**

- [ ] **Are signed URLs used for private files?**

---

## Chat Changes

When modifying chat functionality:

- [ ] **Is tenant_id enforced on all queries?**

- [ ] **Is membership validated before room join?**

- [ ] **Is membership validated before message send?**

- [ ] **Are Socket.IO rooms tenant-namespaced?**
  ```typescript
  `channel:${tenantId}:${channelId}`
  ```

---

## Super Admin Provisioning

When adding provisioning flows:

- [ ] **Does it use getPrimaryWorkspaceIdOrFail?**
  ```typescript
  const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
  ```

- [ ] **Is there audit logging?**
  ```typescript
  await recordTenantAuditEvent(tenantId, "action_name", ...);
  ```

- [ ] **Are request IDs passed for error correlation?**

---

## Frontend Changes

When adding frontend features:

- [ ] **Is TenantContextGate wrapping the component?**

- [ ] **Are queries invalidated on tenant switch?**

- [ ] **Is loading state shown during data fetch?**

---

## Before Submitting PR

- [ ] No hardcoded tenant IDs
- [ ] No workspace-based visibility filters
- [ ] All new tables have tenant_id if needed
- [ ] All queries filter by effectiveTenantId
- [ ] Storage uses resolver, not direct client
- [ ] No secrets in logs or responses
- [ ] Tests cover tenant isolation

---

## Quick Reference: Correct Patterns

### Query Pattern
```typescript
const items = await db.select()
  .from(table)
  .where(eq(table.tenantId, effectiveTenantId));
```

### Insert Pattern
```typescript
await db.insert(table).values({
  tenantId: effectiveTenantId,
  // ...other fields
});
```

### Validation Pattern
```typescript
const entity = await getById(id);
if (entity.tenantId !== effectiveTenantId) {
  throw new ForbiddenError();
}
```

### Storage Pattern
```typescript
const config = await getStorageConfig(tenantId);
const client = createS3ClientFromConfig(config);
```

---

## Related Documentation

- [Tenancy Model](../architecture/TENANCY_MODEL.md)
- [Storage Overview](../storage/STORAGE_OVERVIEW.md)
- [Chat Architecture](../chat/CHAT_ARCHITECTURE.md)
