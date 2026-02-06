# CRM API Registry

## Overview

All CRM endpoints live under `/api/crm/` and are separate from the existing `/api/clients` routes. This ensures zero disruption to existing client management behavior.

## Authentication & Authorization

- All endpoints require authentication (`requireAuth` middleware)
- CRM field updates (`PATCH /api/crm/clients/:clientId/crm`) require Admin role (`requireAdmin`)
- Note deletion requires either authorship or Admin role
- All endpoints enforce tenant scoping via `getEffectiveTenantId()`

## Endpoints

### CRM Summary

#### GET /api/crm/clients/:clientId/summary

Returns a comprehensive overview of the client with CRM fields and aggregate counts.

**Auth:** Any authenticated user in the client's tenant

**Response:**
```json
{
  "client": {
    "id": "uuid",
    "companyName": "string",
    "displayName": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "status": "string",
    "industry": "string | null"
  },
  "crm": {
    "clientId": "uuid",
    "tenantId": "uuid",
    "status": "lead | prospect | active | past | on_hold",
    "ownerUserId": "uuid | null",
    "tags": ["string"],
    "lastContactAt": "ISO timestamp | null",
    "nextFollowUpAt": "ISO timestamp | null",
    "followUpNotes": "string | null"
  },
  "counts": {
    "projects": 0,
    "openTasks": 0,
    "totalHours": 0.0,
    "billableHours": 0.0
  }
}
```

---

### Contacts

#### GET /api/crm/clients/:clientId/contacts

Lists all contacts for a client, ordered by primary flag then creation date.

**Auth:** Any authenticated user in the client's tenant

#### POST /api/crm/clients/:clientId/contacts

Creates a new contact for a client.

**Auth:** Any authenticated user in the client's tenant

**Body (Zod validated):**
```json
{
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "title": "string (optional)",
  "email": "email (optional, nullable)",
  "phone": "string (optional, nullable)",
  "isPrimary": "boolean (optional)",
  "notes": "string (optional, nullable)"
}
```

#### PATCH /api/crm/contacts/:id

Updates an existing contact. Verifies the contact belongs to the user's tenant.

**Auth:** Any authenticated user in the contact's tenant

**Body:** Partial update using `updateClientContactSchema`

#### DELETE /api/crm/contacts/:id

Deletes a contact. Verifies tenant ownership.

**Auth:** Any authenticated user in the contact's tenant

---

### CRM Fields (Pipeline)

#### PATCH /api/crm/clients/:clientId/crm

Creates or updates the CRM record for a client (upsert). Admin-only.

**Auth:** Admin role required

**Body (Zod validated):**
```json
{
  "status": "lead | prospect | active | past | on_hold (optional)",
  "ownerUserId": "uuid | null (optional)",
  "tags": ["string"] | null (optional)",
  "lastContactAt": "ISO datetime | null (optional)",
  "nextFollowUpAt": "ISO datetime | null (optional)",
  "followUpNotes": "string | null (optional)"
}
```

---

### Notes

#### GET /api/crm/clients/:clientId/notes

Lists all notes for a client with author information, ordered by most recent first.

**Auth:** Any authenticated user in the client's tenant

**Response:** Array of note objects with `authorName` and `authorEmail` joined from users table.

#### POST /api/crm/clients/:clientId/notes

Creates a new note for a client.

**Auth:** Any authenticated user in the client's tenant

**Body (Zod validated):**
```json
{
  "body": "any (TipTap JSON or plain object)",
  "category": "string (optional, default: 'general')",
  "categoryId": "uuid (optional, nullable)"
}
```

#### DELETE /api/crm/notes/:id

Deletes a note and its version history. Only the author or an admin can delete.

**Auth:** Note author or Admin role

---

## Error Responses

All endpoints use the standard error envelope:

```json
{
  "error": {
    "code": "NOT_FOUND | VALIDATION_ERROR | FORBIDDEN | ...",
    "message": "Human-readable message",
    "status": 404,
    "requestId": "uuid"
  }
}
```

Validation errors (422) include field-level details:
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": { "status": ["Invalid enum value"] }
}
```

## Test Coverage

Tests are in `server/tests/crm-api.test.ts` covering:
- Tenant isolation (cross-tenant access returns 404/403)
- RBAC enforcement (employee cannot update CRM fields)
- CRUD operations for contacts, CRM fields, and notes
- Validation error handling for invalid inputs
