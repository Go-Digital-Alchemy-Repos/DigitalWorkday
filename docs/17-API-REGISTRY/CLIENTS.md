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

**Last Synced:** 2026-02-05T02:15:12.361Z

**Synced From:**
- `server/features/clients/router.ts`
- `server/features/templates/router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/clients/` |
| GET | `/api/clients/hierarchy/list` |
| GET | `/api/clients/:id` |
| POST | `/api/clients/` |
| PATCH | `/api/clients/:id` |
| DELETE | `/api/clients/:id` |
| GET | `/api/clients/:clientId/contacts` |
| POST | `/api/clients/:clientId/contacts` |
| PATCH | `/api/clients/:clientId/contacts/:contactId` |
| DELETE | `/api/clients/:clientId/contacts/:contactId` |
| GET | `/api/clients/:clientId/invites` |
| POST | `/api/clients/:clientId/invites` |
| DELETE | `/api/clients/:clientId/invites/:inviteId` |
| GET | `/api/clients/` |
| GET | `/api/clients/:id` |
| POST | `/api/clients/` |
| PATCH | `/api/clients/:id` |
| DELETE | `/api/clients/:id` |

<!-- === END AUTO-GENERATED SECTION === -->
