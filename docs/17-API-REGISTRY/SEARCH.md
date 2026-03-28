# search API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | search |
| **Route File(s)** | `server/routes/modules/search/search.router.ts` |
| **Base Path(s)** | /api/v1/search, /api/v1/clients |

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

**Last Synced:** 2026-03-28T02:12:59.366Z

**Synced From:**
- `server/routes/modules/search/search.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/search` |
| GET | `/api/v1/clients/:clientId/search` |

<!-- === END AUTO-GENERATED SECTION === -->
