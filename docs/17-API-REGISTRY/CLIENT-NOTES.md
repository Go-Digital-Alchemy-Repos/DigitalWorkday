# Client Notes API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Client Notes |
| **Route File(s)** | `server/features/clients/notes.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.365Z

**Synced From:**
- `server/routes/modules/crm/notes.router.ts`
- `server/features/clients/notes.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/clients/crm/clients/:clientId/notes` |
| POST | `/api/clients/crm/clients/:clientId/notes` |
| PUT | `/api/clients/crm/notes/:id` |
| DELETE | `/api/clients/crm/notes/:id` |
| GET | `/api/clients/crm/clients/:clientId/notes/categories` |
| GET | `/api/clients/:clientId/notes/categories` |
| POST | `/api/clients/:clientId/notes/categories` |
| PUT | `/api/clients/:clientId/notes/categories/:categoryId` |
| DELETE | `/api/clients/:clientId/notes/categories/:categoryId` |
| GET | `/api/clients/:clientId/notes` |
| POST | `/api/clients/:clientId/notes` |
| GET | `/api/clients/:clientId/notes/:noteId` |
| PUT | `/api/clients/:clientId/notes/:noteId` |
| DELETE | `/api/clients/:clientId/notes/:noteId` |
| GET | `/api/clients/:clientId/notes/:noteId/versions` |
| POST | `/api/clients/:clientId/notes/:noteId/attachments/upload` |
| GET | `/api/clients/:clientId/notes/:noteId/attachments/:attachmentId/download` |
| DELETE | `/api/clients/:clientId/notes/:noteId/attachments/:attachmentId` |

<!-- === END AUTO-GENERATED SECTION === -->
