# Role Permissions

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Authentication](./AUTHENTICATION.md), [Super Admin Act-As-Tenant](./SUPER_ADMIN_ACT_AS.md)

---

## Role Hierarchy

```
Super Admin (Platform Level)
    └── Can manage all tenants
    └── Can impersonate tenant admins
    └── No direct tenant data access without impersonation

Tenant Admin (Tenant Level)
    └── Full access within their tenant
    └── Can manage users, settings, integrations
    └── Can see all tenant data

Employee (Tenant Level)
    └── Limited access based on membership
    └── Sees only assigned projects
    └── Can manage own time entries

Client User (Portal Access)
    └── External access to specific clients
    └── VIEWER: Read-only project/task access
    └── COLLABORATOR: Can add comments
```

---

## Permission Matrix

### Super Admin

| Action | Allowed |
|--------|---------|
| Create tenants | Yes |
| Manage tenants | Yes |
| View system health | Yes |
| Impersonate tenant users | Yes |
| Access tenant data directly | No (must impersonate) |
| Modify platform settings | Yes |

### Tenant Admin

| Action | Allowed |
|--------|---------|
| Manage users | Yes |
| Manage teams | Yes |
| View all projects | Yes |
| Manage integrations | Yes |
| View all time entries | Yes |
| Manage branding | Yes |

### Employee

| Action | Allowed |
|--------|---------|
| View assigned projects | Yes |
| View all clients | Yes (tenant-wide) |
| Create tasks | Yes (in member projects) |
| View own time entries | Yes |
| View all time entries | No |
| Manage users | No |

### Client User

| Action | VIEWER | COLLABORATOR |
|--------|--------|--------------|
| View projects | Yes | Yes |
| View tasks | Yes | Yes |
| Add comments | No | Yes |
| Create tasks | No | No |
| View time entries | No | No |

---

## Checking Permissions in Code

```typescript
// Check if user is super admin
if (user.role === "super") {
  // Platform-level operations
}

// Check if user is tenant admin
if (user.role === "admin" && user.tenantId) {
  // Tenant admin operations
}

// Check if user is employee
if (user.role === "employee" && user.tenantId) {
  // Employee operations with membership checks
}

// Check project membership for employees
const isMember = await isProjectMember(projectId, userId);
if (!isMember && user.role !== "admin") {
  throw new ForbiddenError();
}
```

---

## Related Documentation

- [Authentication](./AUTHENTICATION.md)
- [Super Admin Act-As-Tenant](./SUPER_ADMIN_ACT_AS.md)
- [Tenant Data Visibility](../security/TENANT_DATA_VISIBILITY.md)
