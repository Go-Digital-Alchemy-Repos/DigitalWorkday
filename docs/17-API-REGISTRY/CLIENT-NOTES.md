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

**Last Synced:** 2026-02-05T02:15:12.361Z

**Synced From:**
- `server/features/clients/notes.router.ts`

### Endpoints

| Method | Path |
|--------|------|
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

<!-- === END AUTO-GENERATED SECTION === -->
