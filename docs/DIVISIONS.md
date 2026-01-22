# Client Divisions

Client Divisions provide optional organizational structure within clients for finer-grained access control. This feature allows tenants to segment projects by department, region, or any other logical grouping within a client.

## Overview

Divisions are **optional** - clients without divisions continue working exactly as before. When a client has one or more divisions:

1. Projects for that client must be assigned to a division
2. Employees see only projects in divisions they belong to
3. Admins can see all projects regardless of division membership

## Data Model

### Tables

**client_divisions**
| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID primary key |
| tenantId | varchar (FK) | Reference to tenants.id |
| clientId | varchar (FK) | Reference to clients.id |
| name | text | Division name (required) |
| description | text | Optional description |
| color | text | Optional color for UI display |
| isActive | boolean | Default true |
| createdAt | timestamp | Auto-generated |
| updatedAt | timestamp | Auto-generated |

**division_members**
| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID primary key |
| tenantId | varchar (FK) | Reference to tenants.id |
| divisionId | varchar (FK) | Reference to client_divisions.id |
| userId | varchar (FK) | Reference to users.id |
| role | text | Member role (default: "member") |
| createdAt | timestamp | Auto-generated |

**projects.divisionId** (nullable FK)
- Optional reference to client_divisions.id
- Required when the project's client has divisions
- Projects without clients never have divisions

## API Endpoints

### List Divisions

```
GET /api/v1/clients/:clientId/divisions
```

Returns divisions for a client. Admins see all divisions; employees see only divisions they belong to.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Engineering",
    "description": "Engineering department",
    "color": "#3B82F6",
    "isActive": true,
    "memberCount": 5,
    "projectCount": 12,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
]
```

### Create Division

```
POST /api/v1/clients/:clientId/divisions
```

**Requires:** Tenant admin role

**Request Body:**
```json
{
  "name": "Engineering",
  "description": "Engineering department",
  "color": "#3B82F6",
  "isActive": true
}
```

### Update Division

```
PATCH /api/v1/divisions/:divisionId
```

**Requires:** Tenant admin role

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "color": "#10B981",
  "isActive": false
}
```

### List Division Members

```
GET /api/v1/divisions/:divisionId/members
```

Admins can view any division's members. Employees can only view divisions they belong to.

**Response:**
```json
{
  "members": [
    {
      "id": "uuid",
      "divisionId": "uuid",
      "userId": "uuid",
      "role": "member",
      "user": {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### Add Division Members

```
POST /api/v1/divisions/:divisionId/members
```

**Requires:** Tenant admin role

**Request Body:**
```json
{
  "userIds": ["user-id-1", "user-id-2"]
}
```

This endpoint sets the complete member list. Users not in the array will be removed from the division.

### Remove Division Member

```
DELETE /api/v1/divisions/:divisionId/members/:userId
```

**Requires:** Tenant admin role

## Scoping Helpers

Three helper functions in `storage.ts` support division-based access control:

### getEffectiveDivisionScope(userId, tenantId)

Returns the effective division scope for a user:
- For admins: Returns `"ALL"` - full access to all projects
- For employees: Returns an array of division IDs they belong to
- If user belongs to no divisions: Returns empty array `[]`

```typescript
const scope = await storage.getEffectiveDivisionScope(userId, tenantId);
if (scope === "ALL") {
  // Admin - show all projects
} else if (scope.length === 0) {
  // Employee with no divisions - show no division-scoped projects
} else {
  // Employee - filter projects by division IDs in scope
}
```

### validateDivisionBelongsToClientTenant(divisionId, clientId, tenantId)

Validates that a division belongs to the specified client and tenant. Prevents cross-tenant or cross-client division assignments.

```typescript
const isValid = await storage.validateDivisionBelongsToClientTenant(
  divisionId, clientId, tenantId
);
if (!isValid) {
  return res.status(400).json({ error: "Invalid division" });
}
```

### validateUserBelongsToTenant(userId, tenantId)

Validates that a user belongs to the specified tenant. Used for tenant isolation checks when adding members.

```typescript
const isValid = await storage.validateUserBelongsToTenant(userId, tenantId);
if (!isValid) {
  return res.status(400).json({ error: "User not in tenant" });
}
```

## Project Division Assignment

When creating or updating a project with a client:

1. **Client has divisions**: `divisionId` is required
2. **Client has no divisions**: `divisionId` must be null
3. **No client assigned**: `divisionId` must be null

The routes enforce these rules:

```typescript
// Check if client has divisions
const clientDivisions = await storage.getClientDivisionsByClient(clientId, tenantId);
if (clientDivisions.length > 0) {
  if (!divisionId) {
    return res.status(400).json({ error: "Division is required when client has divisions" });
  }
  // Validate divisionId belongs to this client
  const valid = await storage.validateDivisionBelongsToClientTenant(divisionId, clientId, tenantId);
  if (!valid) {
    return res.status(400).json({ error: "Division does not belong to the selected client" });
  }
} else if (divisionId) {
  return res.status(400).json({ error: "Cannot assign division to a client without divisions" });
}
```

## Access Control Summary

| Role | List Divisions | Create/Update Division | Manage Members | View All Projects |
|------|----------------|------------------------|----------------|-------------------|
| super_user | All | Yes | Yes | Yes |
| admin | All | Yes | Yes | Yes |
| employee | Own only | No | No | Own divisions only |

## Test Coverage

The following test files verify division functionality:

- `division_member_scoping_helper.test.ts` - Scoping helper unit tests (15 tests)
- `divisions_schema_migration_smoke.test.ts` - Schema/migration smoke tests (6 tests)
- `list_divisions_scoped_to_tenant.test.ts` - List endpoint scoping (5 tests)
- `create_division_requires_client_and_tenant.test.ts` - Creation validation (5 tests)
- `add_division_member_tenant_only.test.ts` - Member management (8 tests)
- `project_rejects_division_not_in_client.test.ts` - Project validation (5 tests)
- `project_requires_division_when_client_has_divisions.test.ts` - Required field (4 tests)

Run all division tests:
```bash
npx vitest run server/tests/*division*.test.ts
```

## Backward Compatibility

Existing clients and projects without divisions continue to work unchanged:
- Legacy projects with `divisionId = null` are not affected
- Clients can optionally add divisions at any time
- When a client gets its first division, new projects must specify a division
- Existing projects for that client remain accessible but should be migrated

## Migration Notes

When adding divisions to an existing client:

1. Create divisions for the client
2. Assign employees to appropriate divisions
3. Update existing projects to specify their division
4. New projects will require division selection
