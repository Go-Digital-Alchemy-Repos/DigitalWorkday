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

**Last Synced:** 2026-02-05T00:11:27.573Z

**Synced From:**
- `server/features/clients/documents.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/clients/:clientId/documents/categories` |
| POST | `/api/v1/clients/:clientId/documents/categories` |
| PATCH | `/api/v1/clients/:clientId/documents/categories/:categoryId` |
| DELETE | `/api/v1/clients/:clientId/documents/categories/:categoryId` |
| GET | `/api/v1/clients/:clientId/documents` |
| POST | `/api/v1/clients/:clientId/documents/upload` |
| POST | `/api/v1/clients/:clientId/documents/:documentId/complete` |
| PATCH | `/api/v1/clients/:clientId/documents/:documentId` |
| DELETE | `/api/v1/clients/:clientId/documents/:documentId` |
| GET | `/api/v1/clients/:clientId/documents/:documentId/download` |

<!-- === END AUTO-GENERATED SECTION === -->
