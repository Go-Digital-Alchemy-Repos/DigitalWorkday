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

**Last Synced:** 2026-02-05T00:11:27.574Z

**Synced From:**
- `server/features/clients/notes.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/clients/:clientId/notes/categories` |
| POST | `/api/v1/clients/:clientId/notes/categories` |
| PUT | `/api/v1/clients/:clientId/notes/categories/:categoryId` |
| DELETE | `/api/v1/clients/:clientId/notes/categories/:categoryId` |
| GET | `/api/v1/clients/:clientId/notes` |
| POST | `/api/v1/clients/:clientId/notes` |
| GET | `/api/v1/clients/:clientId/notes/:noteId` |
| PUT | `/api/v1/clients/:clientId/notes/:noteId` |
| DELETE | `/api/v1/clients/:clientId/notes/:noteId` |
| GET | `/api/v1/clients/:clientId/notes/:noteId/versions` |

<!-- === END AUTO-GENERATED SECTION === -->
