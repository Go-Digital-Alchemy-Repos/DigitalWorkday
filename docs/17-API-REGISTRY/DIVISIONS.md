# Divisions API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Divisions |
| **Route File(s)** | `server/features/clients/divisions.router.ts` |
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

**Last Synced:** 2026-02-05T00:11:27.572Z

**Synced From:**
- `server/features/clients/divisions.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/clients/clients/:clientId/divisions` |
| POST | `/api/v1/clients/clients/:clientId/divisions` |
| PATCH | `/api/v1/clients/divisions/:divisionId` |
| GET | `/api/v1/clients/divisions/:divisionId/members` |
| POST | `/api/v1/clients/divisions/:divisionId/members` |
| DELETE | `/api/v1/clients/divisions/:divisionId/members/:userId` |
| GET | `/api/v1/clients/divisions/:divisionId/projects` |
| GET | `/api/v1/clients/divisions/:divisionId/tasks` |

<!-- === END AUTO-GENERATED SECTION === -->
