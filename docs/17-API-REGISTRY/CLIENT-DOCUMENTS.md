# Client Documents API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Client Documents |
| **Route File(s)** | `server/features/clients/documents.router.ts` |
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

**Last Synced:** 2026-02-05T02:15:12.360Z

**Synced From:**
- `server/features/clients/documents.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/clients/:clientId/documents/categories` |
| POST | `/api/clients/:clientId/documents/categories` |
| PATCH | `/api/clients/:clientId/documents/categories/:categoryId` |
| DELETE | `/api/clients/:clientId/documents/categories/:categoryId` |
| GET | `/api/clients/:clientId/documents` |
| POST | `/api/clients/:clientId/documents/upload` |
| POST | `/api/clients/:clientId/documents/:documentId/complete` |
| PATCH | `/api/clients/:clientId/documents/:documentId` |
| DELETE | `/api/clients/:clientId/documents/:documentId` |
| GET | `/api/clients/:clientId/documents/:documentId/download` |

<!-- === END AUTO-GENERATED SECTION === -->
