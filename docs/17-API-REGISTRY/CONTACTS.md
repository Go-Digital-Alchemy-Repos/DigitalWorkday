# contacts API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | contacts |
| **Route File(s)** | `server/routes/modules/crm/contacts.router.ts` |
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
- `server/routes/modules/crm/contacts.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/crm/clients/:clientId/contacts` |
| POST | `/api/v1/crm/clients/:clientId/contacts` |
| PATCH | `/api/v1/crm/contacts/:id` |
| DELETE | `/api/v1/crm/contacts/:id` |

<!-- === END AUTO-GENERATED SECTION === -->
