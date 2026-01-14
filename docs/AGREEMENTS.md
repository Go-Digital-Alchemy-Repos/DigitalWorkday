# Agreement Enforcement System

This document describes the SaaS Agreement enforcement system behavior, security invariants, and edge case handling.

## Overview

The Agreement Enforcement System ensures that tenant users accept required legal agreements (Terms of Service, etc.) before accessing the application. Agreements are managed per-tenant by tenant admins.

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Middleware | `server/middleware/agreementEnforcement.ts` | Enforces agreement acceptance on API routes |
| Agreements Table | `tenant_agreements` | Stores agreement documents with status lifecycle |
| Acceptances Table | `tenant_agreement_acceptances` | Tracks which users accepted which versions |
| Routes | `/api/v1/me/agreement/*` | User-facing status and acceptance endpoints |

## Agreement Lifecycle

```
DRAFT --> ACTIVE --> ARCHIVED
```

- **DRAFT**: Agreement is being prepared. Not enforced.
- **ACTIVE**: Agreement is live and enforcement applies. Only ONE active per tenant.
- **ARCHIVED**: Agreement was superseded. Not enforced.

## Security Invariants

### 1. Fail-Closed Behavior (CRITICAL)

If any error occurs during enforcement checks (database errors, unexpected exceptions), the middleware **BLOCKS access by default**.

**Rationale**: Prevents accidental bypasses due to system failures. Security > Availability in this context.

**Response on error**:
```json
{
  "error": "Agreement verification failed",
  "code": "AGREEMENT_CHECK_ERROR",
  "message": "Unable to verify agreement status. Please try again or contact support.",
  "redirectTo": "/accept-terms"
}
```

### 2. Super User Bypass

Users with `role=super_user` are **ALWAYS allowed through** without checking agreement status.

**Rationale**: Super users manage the platform and aren't bound by tenant agreements. This includes super users impersonating tenants via `X-Tenant-Id` header.

### 3. No Active Agreement Behavior

If a tenant has **NO active agreement** (only drafts, archived, or no agreements at all), users are **ALLOWED through**.

**Rationale**: 
- Tenant admins configure agreements
- Until one is activated, enforcement cannot apply
- This is explicit policy to avoid blocking new tenants before setup

### 4. Exempt Routes

Certain routes must remain accessible regardless of agreement status:

| Pattern | Purpose |
|---------|---------|
| `/api/auth/*` | Login, logout, session management |
| `/api/v1/me/agreement/*` | Check status, accept agreement |
| `/api/v1/tenant/onboarding/*` | Tenant setup flow |
| `/api/v1/invitations/*` | Accept invitations |
| `/api/v1/super/*` | Super admin routes |
| Static assets | JS, CSS, images, fonts, etc. |

### 5. Unauthenticated Users

Users who are not authenticated are **ALLOWED through** the agreement middleware.

**Rationale**: Authentication enforcement happens via separate middleware (`requireAuth`). Agreement enforcement only applies after authentication.

### 6. Non-Super Users Without Tenant (Orphaned Users)

Non-super users with no `tenantId` are **BLOCKED** with HTTP 451.

**Response**:
```json
{
  "error": "Account configuration error",
  "code": "NO_TENANT_ASSIGNED",
  "message": "Your account is not properly configured. Please contact your administrator.",
  "redirectTo": "/accept-terms"
}
```

**Rationale**: 
- Catches orphaned users (tenant deleted/misconfigured)
- Prevents bypassing agreement enforcement via null tenantId
- Fail-closed behavior for account integrity
- Only `super_user` role (checked earlier) can proceed without tenantId

## Response Contract

### Agreement Required (HTTP 451)

When a user must accept an agreement:

```json
{
  "error": "Agreement acceptance required",
  "code": "AGREEMENT_REQUIRED", 
  "message": "You must accept the terms of service before continuing.",
  "redirectTo": "/accept-terms"
}
```

HTTP 451 ("Unavailable For Legal Reasons") is used per RFC 7725.

### Check Error (HTTP 451)

When enforcement check fails:

```json
{
  "error": "Agreement verification failed",
  "code": "AGREEMENT_CHECK_ERROR",
  "message": "Unable to verify agreement status. Please try again or contact support.",
  "redirectTo": "/accept-terms"
}
```

## Caching

Active agreements are cached per-tenant for 60 seconds to reduce database load.

To invalidate cache:
```typescript
import { invalidateAgreementCache } from "./middleware/agreementEnforcement";
invalidateAgreementCache(tenantId);
```

## Logging

Enforcement errors are logged with structured JSON including:
- `requestId`
- `tenantId`
- `userId`
- `path`
- `errorMessage`
- `timestamp`

No secrets are logged.

## Testing

Tests are located at `server/tests/agreement-enforcement.test.ts` and cover:

1. Tenant with no agreements (allows access)
2. Tenant with draft-only agreements (allows access)
3. Tenant with active agreement - not accepted (blocks with 451)
4. Tenant with active agreement - accepted (allows access)
5. Exempt routes bypass enforcement
6. Super user bypass (with and without impersonation)
7. Fail-closed on database errors
8. Unauthenticated user passthrough
9. Non-super user without tenant blocked (orphaned user protection)
10. Super user without tenant allowed (platform admin)
11. Archived agreement handling

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| DB connection failure | Block (451) | Fail-closed for security |
| Corrupted acceptance record | Block (451) | Fail-closed for security |
| Tenant deleted mid-request | Block (451) | Fail-closed for security |
| User has null tenantId | Block (451) | Orphaned user, fail-closed |
| Agreement version bump | Block until re-acceptance | Version-specific acceptance |
| Multiple active agreements | Uses first found | Should never happen (UI prevents) |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-14 | Initial documentation with fail-closed hardening |
