# tenant-invitations API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant-invitations |
| **Route File(s)** | `server/routes/modules/super-admin/tenant-invitations.router.ts` |
| **Base Path(s)** | /api/v1/tenants |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | TBD |
| **Tenant Scoped** | TBD |

---

<!-- === MANUAL NOTES SECTION (safe to edit) === -->

## Notes / Gotchas

*Add manual notes here. This section will be preserved during sync.*

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-03-28T02:12:59.373Z

**Synced From:**
- `server/routes/modules/super-admin/tenant-invitations.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenants/:tenantId/invitations` |
| POST | `/api/v1/tenants/:tenantId/invitations/:invitationId/activate` |
| POST | `/api/v1/tenants/:tenantId/invitations/activate-all` |
| POST | `/api/v1/tenants/:tenantId/invitations/:invitationId/revoke` |
| POST | `/api/v1/tenants/:tenantId/invitations/:invitationId/resend` |
| POST | `/api/v1/tenants/:tenantId/invitations/:invitationId/regenerate` |
| DELETE | `/api/v1/tenants/:tenantId/invitations/:invitationId` |

<!-- === END AUTO-GENERATED SECTION === -->
