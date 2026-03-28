# invitations API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | invitations |
| **Route File(s)** | `server/routes/modules/super-admin/invitations.router.ts` |
| **Base Path(s)** | /api/v1/invitations |

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

**Last Synced:** 2026-03-28T02:12:59.369Z

**Synced From:**
- `server/routes/modules/super-admin/invitations.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/invitations/:invitationId/resend` |
| DELETE | `/api/v1/invitations/:invitationId` |
| POST | `/api/v1/invitations/:invitationId/activate` |

<!-- === END AUTO-GENERATED SECTION === -->
