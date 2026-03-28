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

**Last Synced:** 2026-03-28T02:12:59.362Z

**Synced From:**
- `server/routes/clients.router.ts`
- `server/features/clients/router.ts`
- `server/features/templates/router.ts`

### Endpoints

| Method | Path |
|--------|------|
| PATCH | `/api/v1/projects/:projectId/client` |
| GET | `/api/v1/clients` |
| GET | `/api/v1/clients/:id` |
| POST | `/api/v1/clients` |
| PATCH | `/api/v1/clients/:id` |
| DELETE | `/api/v1/clients/:id` |
| GET | `/api/v1/clients/:clientId/contacts` |
| POST | `/api/v1/clients/:clientId/contacts` |
| PATCH | `/api/v1/clients/:clientId/contacts/:contactId` |
| DELETE | `/api/v1/clients/:clientId/contacts/:contactId` |
| GET | `/api/v1/clients/:clientId/invites` |
| POST | `/api/v1/clients/:clientId/invites` |
| DELETE | `/api/v1/clients/:clientId/invites/:inviteId` |
| GET | `/api/v1/clients/:clientId/projects` |
| POST | `/api/v1/clients/:clientId/projects` |
| GET | `/api/v1/clients/:clientId/notes` |
| POST | `/api/v1/clients/:clientId/notes` |
| PUT | `/api/v1/clients/:clientId/notes/:noteId` |
| GET | `/api/v1/clients/:clientId/notes/:noteId/versions` |
| DELETE | `/api/v1/clients/:clientId/notes/:noteId` |
| GET | `/api/v1/clients/:clientId/note-categories` |
| POST | `/api/v1/clients/:clientId/note-categories` |
| GET | `/api/clients/` |
| GET | `/api/clients/hierarchy/list` |
| GET | `/api/clients/summary` |
| GET | `/api/clients/stages/summary` |
| PATCH | `/api/clients/:id/stage` |
| GET | `/api/clients/:id/stage-history` |
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
