# Clients API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Clients |
| **Route File(s)** | `server/features/clients/router.ts` |
| **Base Path(s)** | /api/v1/clients |

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

**Last Synced:** 2026-02-05T00:11:27.575Z

**Synced From:**
- `server/features/clients/router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/clients/` |
| GET | `/api/v1/clients/hierarchy/list` |
| GET | `/api/v1/clients/:id` |
| POST | `/api/v1/clients/` |
| PATCH | `/api/v1/clients/:id` |
| DELETE | `/api/v1/clients/:id` |
| GET | `/api/v1/clients/:clientId/contacts` |
| POST | `/api/v1/clients/:clientId/contacts` |
| PATCH | `/api/v1/clients/:clientId/contacts/:contactId` |
| DELETE | `/api/v1/clients/:clientId/contacts/:contactId` |
| GET | `/api/v1/clients/:clientId/invites` |
| POST | `/api/v1/clients/:clientId/invites` |
| DELETE | `/api/v1/clients/:clientId/invites/:inviteId` |

<!-- === END AUTO-GENERATED SECTION === -->
