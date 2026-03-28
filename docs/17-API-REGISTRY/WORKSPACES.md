# workspaces API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | workspaces |
| **Route File(s)** | `server/routes/workspaces.router.ts` |
| **Base Path(s)** | /api/v1/workspaces, /api/v1/workspace-members |

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

**Last Synced:** 2026-03-28T02:12:59.382Z

**Synced From:**
- `server/routes/workspaces.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/workspaces/current` |
| GET | `/api/v1/workspaces/:id` |
| POST | `/api/v1/workspaces` |
| GET | `/api/v1/workspaces/:workspaceId/members` |
| POST | `/api/v1/workspaces/:workspaceId/members` |
| PATCH | `/api/v1/workspaces/:id` |
| GET | `/api/v1/workspaces` |
| GET | `/api/v1/workspace-members` |

<!-- === END AUTO-GENERATED SECTION === -->
