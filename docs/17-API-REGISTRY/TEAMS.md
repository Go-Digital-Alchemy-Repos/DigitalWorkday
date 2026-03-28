# teams API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | teams |
| **Route File(s)** | `server/routes/teams.router.ts` |
| **Base Path(s)** | /api/v1/teams |

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

**Last Synced:** 2026-03-28T02:12:59.379Z

**Synced From:**
- `server/routes/teams.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/teams` |
| GET | `/api/v1/teams/:id` |
| POST | `/api/v1/teams` |
| GET | `/api/v1/teams/:teamId/members` |
| POST | `/api/v1/teams/:teamId/members` |
| PATCH | `/api/v1/teams/:id` |
| DELETE | `/api/v1/teams/:id` |
| DELETE | `/api/v1/teams/:teamId/members/:userId` |

<!-- === END AUTO-GENERATED SECTION === -->
