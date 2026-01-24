# Super Admin "Act As Tenant"

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Role Permissions](./ROLE_PERMISSIONS.md), [Effective Tenant Context](../architecture/EFFECTIVE_TENANT_CONTEXT.md)

---

## Overview

Super Admins can "act as" a tenant to view and manage tenant data. This is essential for support, debugging, and tenant administration.

---

## How It Works

### Starting Impersonation

```typescript
// POST /api/auth/impersonate
// Body: { tenantId: "tenant-uuid" }

// Server stores in session
req.session.impersonatingTenantId = targetTenantId;
```

### During Impersonation

All data access uses the impersonated tenant's context:

```typescript
function getEffectiveTenantId(req: Request): string | null {
  if (req.user?.role === 'super' && req.session?.impersonatingTenantId) {
    return req.session.impersonatingTenantId;
  }
  return req.user?.tenantId || null;
}
```

### Ending Impersonation

```typescript
// POST /api/auth/stop-impersonation

// Server clears session
delete req.session.impersonatingTenantId;
```

---

## Safeguards

### 1. Only Super Admins Can Impersonate
```typescript
if (user.role !== 'super') {
  throw new ForbiddenError('Only super admins can impersonate');
}
```

### 2. Cannot Impersonate Other Super Admins
```typescript
const targetTenant = await getTenant(tenantId);
if (targetTenant.isSuperTenant) {
  throw new ForbiddenError('Cannot impersonate super tenant');
}
```

### 3. Audit Logging
```typescript
await recordTenantAuditEvent(
  tenantId,
  'super_admin_impersonation_started',
  `Super admin ${superAdmin.email} started impersonation`,
  superAdmin.id
);
```

### 4. Visual Indicator
Frontend shows clear "Acting as [Tenant]" indicator when impersonating.

---

## Frontend Behavior

### Cache Isolation
When switching tenants, all cached data is cleared:

```typescript
const startImpersonation = async (tenantId: string) => {
  await api.post('/api/auth/impersonate', { tenantId });
  
  // Critical: Clear all cached data
  queryClient.clear();
  
  // Navigate to safe route
  navigate('/');
};
```

### UI Indicators
```tsx
function ImpersonationBanner() {
  const { isImpersonating, impersonatedTenant } = useImpersonation();
  
  if (!isImpersonating) return null;
  
  return (
    <Banner variant="warning">
      Acting as: {impersonatedTenant.name}
      <Button onClick={stopImpersonation}>Exit</Button>
    </Banner>
  );
}
```

---

## Security Considerations

1. **All actions are audited** - Every modification during impersonation is logged
2. **Read-only mode option** - Can be configured for view-only access
3. **Session timeout** - Impersonation sessions expire after inactivity
4. **No credential access** - Super admin cannot see tenant passwords/secrets

---

## Common Use Cases

| Use Case | Actions |
|----------|---------|
| Support debugging | View projects, tasks, logs |
| Data verification | Check tenant configuration |
| User assistance | Help with specific features |
| Issue reproduction | Debug tenant-specific problems |

---

## What Super Admins CANNOT Do

- Access tenant passwords or secrets
- Impersonate other super admins
- Bypass rate limits
- Access data without audit trail

---

## Related Documentation

- [Role Permissions](./ROLE_PERMISSIONS.md)
- [Effective Tenant Context](../architecture/EFFECTIVE_TENANT_CONTEXT.md)
- [Security Checklist](../security/SECURITY_CHECKLIST.md)
