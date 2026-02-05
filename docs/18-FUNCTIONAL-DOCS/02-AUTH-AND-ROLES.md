# Authentication & Roles

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

MyWorkDay uses session-based authentication with Passport.js, supporting email/password login and Google OAuth. The role system provides hierarchical access control from Super Admin down to Viewer.

---

## Who Uses It

| Role | Description | Scope |
|------|-------------|-------|
| **super_user** | Platform administrator | Cross-tenant, all system settings |
| **admin** | Tenant administrator | Full control within their tenant |
| **manager** | Team/project manager | Manage projects, assign tasks, view reports |
| **member** | Team member | Create/edit own tasks, log time |
| **viewer** | Read-only user | View projects and tasks only |

---

## Data Model

### Users Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | string | Unique, used for login |
| `password` | string | Bcrypt hashed (null for OAuth-only) |
| `role` | enum | `super_user`, `admin`, `manager`, `member`, `viewer` |
| `tenantId` | UUID | Tenant association (null for super_user) |
| `googleId` | string | Google OAuth identifier |
| `emailVerified` | boolean | Email verification status |
| `lastLoginAt` | timestamp | Last successful login |

### Sessions Table

| Field | Type | Description |
|-------|------|-------------|
| `sid` | string | Session ID (primary key) |
| `sess` | jsonb | Session data including user info |
| `expire` | timestamp | Session expiration time |

---

## Key Flows

### 1. Email/Password Login

```
POST /api/auth/login
    ↓
Passport LocalStrategy
    ↓
Verify email exists → Compare bcrypt hash → Create session
    ↓
Set session cookie → Return user object
```

### 2. Google OAuth Login

```
GET /api/auth/google → Redirect to Google
    ↓
Callback: /api/auth/google/callback
    ↓
Find/create user by googleId → Link to existing email if match
    ↓
Create session → Redirect to app
```

### 3. Account Linking

When a user logs in with Google and an account with that email already exists:
- If no googleId set: Link Google account to existing user
- If different googleId: Reject (email already linked to another Google account)

### 4. First-User Bootstrap

The first user to register on a fresh installation is automatically granted `super_user` role.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Password reset** | Token-based reset via email, invalidates all sessions |
| **Rate limiting** | 5 login attempts per email per minute, 10 per IP |
| **Session expiry** | 24 hours by default, extended on activity |
| **OAuth account linking** | Auto-link if email matches, user confirmation required |
| **Role change** | Immediate effect, no session invalidation |
| **User deletion** | Soft delete, sessions invalidated |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Manage Users** | Admin > Team | Add, edit, remove tenant users |
| **Change Roles** | Admin > Team | Promote/demote user roles |
| **Password Reset** | Super Admin > Users | Force password reset for any user |
| **Session Management** | Super Admin > Users | Invalidate user sessions |
| **View Login History** | Super Admin > Users | Audit login attempts |
| **OAuth Settings** | Super Admin > Settings | Configure Google OAuth |

---

## Permission Matrix

| Action | super_user | admin | manager | member | viewer |
|--------|------------|-------|---------|--------|--------|
| View all tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage tenant settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create projects | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign tasks | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit own tasks | ✅ | ✅ | ✅ | ✅ | ❌ |
| View projects | ✅ | ✅ | ✅ | ✅ | ✅ |
| Log time | ✅ | ✅ | ✅ | ✅ | ❌ |
| View reports | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Related Documentation

- [Authentication](../AUTHENTICATION.md)
- [Bootstrap Super Admin](../BOOTSTRAP_SUPER_ADMIN.md)
- [Security Rate Limits](../SECURITY_RATE_LIMITS.md)
