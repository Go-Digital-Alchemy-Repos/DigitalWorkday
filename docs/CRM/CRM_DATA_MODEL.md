# CRM Data Model

## Overview

The CRM data model extends the existing client management system with pipeline tracking, contact management, and note-taking capabilities. All tables enforce tenant scoping via `tenantId` columns and foreign keys.

## Tables

### client_crm

Pipeline and relationship tracking for each client. One-to-one with `clients` table.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| client_id | varchar (PK, FK) | NOT NULL | — | References clients.id, CASCADE on delete |
| tenant_id | varchar (FK) | NOT NULL | — | References tenants.id |
| status | text | YES | 'active' | Pipeline status: lead, prospect, active, past, on_hold |
| owner_user_id | varchar (FK) | YES | NULL | Account owner, references users.id |
| tags | text[] | YES | NULL | Array of freeform tags |
| last_contact_at | timestamp | YES | NULL | Last interaction timestamp |
| next_follow_up_at | timestamp | YES | NULL | Scheduled follow-up |
| follow_up_notes | text | YES | NULL | Notes for the next follow-up |
| created_at | timestamp | NOT NULL | now() | Row creation time |
| updated_at | timestamp | NOT NULL | now() | Last modification time |

**Indexes:**
- `client_crm_tenant_status_idx` — (tenant_id, status)
- `client_crm_tenant_followup_idx` — (tenant_id, next_follow_up_at)

### client_contacts (extended)

The existing `client_contacts` table has been extended with a `tenant_id` column for direct tenant scoping.

| New Column | Type | Nullable | Description |
|------------|------|----------|-------------|
| tenant_id | varchar (FK) | YES | References tenants.id (nullable for backward compatibility with pre-existing rows) |

**New Indexes:**
- `client_contacts_tenant_client_idx` — (tenant_id, client_id)
- `client_contacts_tenant_email_idx` — (tenant_id, email)

### client_notes (existing)

The existing `client_notes` table is reused for CRM notes. It already has:
- `tenant_id` (NOT NULL)
- `client_id` (FK to clients)
- `author_user_id` (FK to users)
- `body` (jsonb, TipTap rich text)
- `category` / `category_id`
- Version history via `client_note_versions`
- File attachments via `client_note_attachments`

## Tenant Scoping

All CRM tables enforce tenant isolation:
- `client_crm.tenant_id` is NOT NULL
- `client_contacts.tenant_id` is nullable (additive migration, existing rows may lack it)
- `client_notes.tenant_id` is NOT NULL
- API endpoints verify tenant ownership of the parent client before any operation

## Schema Constants

```typescript
export const CrmClientStatus = {
  LEAD: "lead",
  PROSPECT: "prospect",
  ACTIVE: "active",
  PAST: "past",
  ON_HOLD: "on_hold",
} as const;
```

## Migration

- Migration file: `migrations/0012_mute_cannonball.sql`
- Additive only: no existing columns removed or renamed
- Safe to apply to production with existing data
