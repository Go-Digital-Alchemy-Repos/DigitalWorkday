# support API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | support |
| **Route File(s)** | `server/features/client-portal/support.router.ts` |
| **Base Path(s)** | /api/v1/tickets, /api/v1/form-schemas |

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

**Last Synced:** 2026-03-28T02:12:59.382Z

**Synced From:**
- `server/features/client-portal/support.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tickets` |
| GET | `/api/v1/tickets/:id` |
| POST | `/api/v1/tickets` |
| POST | `/api/v1/tickets/:id/messages` |
| GET | `/api/v1/form-schemas/:category` |

<!-- === END AUTO-GENERATED SECTION === -->
