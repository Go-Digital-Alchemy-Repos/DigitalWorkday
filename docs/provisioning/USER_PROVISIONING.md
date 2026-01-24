# User Provisioning

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Primary Workspace](./PRIMARY_WORKSPACE.md), [Tenant Lifecycle](./TENANT_LIFECYCLE.md)

---

## Overview

User provisioning covers all methods of creating users within a tenant, including direct creation, invitations, and bulk import.

---

## Provisioning Methods

### 1. Direct Creation (Super Admin)

Super admins can create users directly:

```typescript
// POST /api/v1/super/tenants/:tenantId/users
const requestId = req.headers["x-request-id"];
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

// Create user
const [user] = await db.insert(users).values({
  tenantId,
  email,
  firstName,
  lastName,
  role: "employee",
  hashedPassword: await hashPassword(temporaryPassword),
  mustChangePasswordOnNextLogin: true,
}).returning();

// Add to primary workspace
await db.insert(workspaceMembers).values({
  workspaceId: primaryWorkspaceId,
  userId: user.id,
  role: "member",
});

// Audit log
await recordTenantAuditEvent(tenantId, "user_created", ...);
```

### 2. Invitation Flow

Tenant admins can invite users via email:

```typescript
// Step 1: Create invitation
await db.insert(invitations).values({
  tenantId,
  email,
  role: "employee",
  invitedBy: adminId,
  token: generateSecureToken(),
  expiresAt: addDays(new Date(), 7),
});

// Step 2: Send invitation email
await sendInvitationEmail(email, inviteLink);

// Step 3: User accepts invitation
// GET /api/auth/accept-invitation?token=xxx
const invitation = await getInvitationByToken(token);
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(invitation.tenantId);

// Create user and workspace membership
await createUserFromInvitation(invitation, primaryWorkspaceId);
```

### 3. Bulk CSV Import (Super Admin)

Import multiple users at once:

```typescript
// POST /api/v1/super/tenants/:tenantId/import/users
const requestId = req.headers["x-request-id"];
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

for (const row of csvRows) {
  // Skip if user exists
  const existing = await getUserByEmail(row.email);
  if (existing) {
    results.push({ email: row.email, status: "skipped" });
    continue;
  }
  
  // Create user
  const user = await createUser({
    tenantId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role || "employee",
  });
  
  // Add to workspace
  await addToWorkspace(primaryWorkspaceId, user.id);
  
  results.push({ email: row.email, status: "created" });
}

// Audit log for batch
await recordTenantAuditEvent(tenantId, "users_imported", ...);
```

---

## Password Management

### Initial Password
- Direct creation: Temporary password + mustChangePasswordOnNextLogin
- Invitation: User sets during acceptance

### Password Reset
- Self-service reset via email link
- Admin-initiated reset with temporary password

---

## Workspace Membership

All users are added to the primary workspace:

```typescript
// Primary workspace is the default for all new users
const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId);

await db.insert(workspaceMembers).values({
  workspaceId: primaryWorkspaceId,
  userId: newUser.id,
  role: "member", // or "owner" for admins
});
```

---

## Error Handling

### Missing Primary Workspace
```typescript
try {
  const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
} catch (error) {
  // Error logged with requestId for debugging
  return res.status(400).json({ error: "Tenant has no workspace" });
}
```

### Duplicate Email
```typescript
const existing = await getUserByEmail(email);
if (existing) {
  return res.status(409).json({ error: "User already exists" });
}
```

---

## Audit Trail

All provisioning is logged:

| Event | Description |
|-------|-------------|
| user_created | Direct user creation |
| user_invited | Invitation sent |
| invitation_accepted | User accepted invitation |
| users_imported | Bulk import completed |
| password_reset | Admin reset user password |

---

## Related Documentation

- [Primary Workspace](./PRIMARY_WORKSPACE.md)
- [Tenant Lifecycle](./TENANT_LIFECYCLE.md)
- [Role Permissions](../auth/ROLE_PERMISSIONS.md)
