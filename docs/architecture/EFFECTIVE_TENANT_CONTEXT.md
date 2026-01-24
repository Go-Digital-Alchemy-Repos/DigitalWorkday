# Effective Tenant Context

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Tenancy Model](./TENANCY_MODEL.md), [Super Admin Act-As-Tenant](../auth/SUPER_ADMIN_ACT_AS.md)

---

## Overview

The "Effective Tenant Context" is the resolved tenant ID used for all data access in a request. It considers:
1. The user's own tenant membership
2. Super Admin impersonation ("Act as Tenant")
3. Session state

---

## How Effective Tenant ID is Determined

### For Regular Users
```
effectiveTenantId = user.tenantId
```

### For Super Admins (Impersonating)
```
effectiveTenantId = session.impersonatingTenantId || null
```

### For Super Admins (Not Impersonating)
```
effectiveTenantId = null (no tenant data access)
```

---

## Backend Resolution

The tenant context is resolved in authentication middleware:

```typescript
// server/middleware/auth.ts
export function getEffectiveTenantId(req: Request): string | null {
  const user = req.user;
  if (!user) return null;
  
  // Super admin impersonating a tenant
  if (user.role === 'super' && req.session?.impersonatingTenantId) {
    return req.session.impersonatingTenantId;
  }
  
  // Regular user - use their tenant
  return user.tenantId || null;
}
```

---

## Frontend "Tenant Context Loaded" Gate

The frontend uses a gate pattern to prevent UI rendering until tenant context is confirmed:

```tsx
// client/src/components/TenantContextGate.tsx
export function TenantContextGate({ children }: { children: React.ReactNode }) {
  const { effectiveTenantId, isLoading } = useTenantContext();
  
  // Don't render until we know the tenant context
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  // No tenant context - show appropriate UI
  if (!effectiveTenantId) {
    return <NoTenantAccess />;
  }
  
  return <>{children}</>;
}
```

### Why the Gate Matters

1. **Prevents stale data**: Without the gate, components might fetch with old/wrong tenant ID
2. **Prevents cross-tenant leaks**: Ensures all queries use correct tenant
3. **Clean UX**: Shows loading state rather than partial/wrong data

---

## Tenant Switching Behavior

When switching tenants (Super Admin "Act as Tenant"):

1. Session is updated with new `impersonatingTenantId`
2. Frontend clears all cached queries
3. "Tenant Context Loaded" gate shows loading
4. All components re-fetch with new tenant context

```typescript
// Frontend cache clearing on tenant switch
const switchTenant = async (newTenantId: string) => {
  await api.post('/api/auth/impersonate', { tenantId: newTenantId });
  
  // Clear ALL cached data - critical for isolation
  queryClient.clear();
  
  // Navigate to safe route
  navigate('/');
};
```

---

## Chat-Specific Context

Chat requires special handling during tenant switches:

1. **Cancel in-flight queries** when switching threads
2. **Clear active thread state** on tenant switch
3. **Re-join tenant-scoped rooms** after switch

```typescript
// Chat clears active state on tenant change
useEffect(() => {
  return () => {
    // Clear chat state when tenant context changes
    setActiveThread(null);
    abortController.abort();
  };
}, [effectiveTenantId]);
```

---

## Common Pitfalls

### 1. Not Waiting for Context
```tsx
// WRONG - Fetches before context is ready
function ProjectList() {
  const { data } = useQuery({ queryKey: ['/api/projects'] });
  return <List items={data} />;
}

// CORRECT - Wrapped in gate
function App() {
  return (
    <TenantContextGate>
      <ProjectList />
    </TenantContextGate>
  );
}
```

### 2. Not Clearing Cache on Switch
```typescript
// WRONG - Stale data persists
const switchTenant = async (id) => {
  await api.post('/api/auth/impersonate', { tenantId: id });
  navigate('/'); // Old cached data still visible!
};

// CORRECT - Clear cache first
const switchTenant = async (id) => {
  await api.post('/api/auth/impersonate', { tenantId: id });
  queryClient.clear(); // Remove all cached data
  navigate('/');
};
```

---

## Related Documentation

- [Tenancy Model](./TENANCY_MODEL.md) - Core tenancy invariants
- [Super Admin Act-As-Tenant](../auth/SUPER_ADMIN_ACT_AS.md) - Impersonation details
