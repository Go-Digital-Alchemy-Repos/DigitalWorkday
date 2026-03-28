# approvals API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | approvals |
| **Route File(s)** | `server/routes/modules/crm/approvals.router.ts` |
| **Base Path(s)** | /api/v1/crm |

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

**Last Synced:** 2026-03-28T02:12:59.364Z

**Synced From:**
- `server/routes/modules/crm/approvals.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/crm/clients/:clientId/approvals` |
| GET | `/api/v1/crm/clients/:clientId/approvals` |
| PATCH | `/api/v1/crm/approvals/:id` |
| GET | `/api/v1/crm/portal/approvals` |

<!-- === END AUTO-GENERATED SECTION === -->
