# Client Portal API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Client Portal |
| **Route File(s)** | `server/features/client-portal/portal.router.ts`, `server/features/clients/portal.router.ts` |
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
- `server/features/client-portal/portal.router.ts`
- `server/features/clients/portal.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/clients/dashboard` |
| GET | `/api/v1/clients/projects` |
| GET | `/api/v1/clients/projects/:projectId` |
| GET | `/api/v1/clients/tasks` |
| GET | `/api/v1/clients/tasks/:taskId` |
| POST | `/api/v1/clients/tasks/:taskId/comments` |
| GET | `/api/v1/clients/profile` |
| GET | `/api/v1/clients/:clientId/users` |
| POST | `/api/v1/clients/:clientId/users/invite` |
| PATCH | `/api/v1/clients/:clientId/users/:userId` |
| DELETE | `/api/v1/clients/:clientId/users/:userId` |
| GET | `/api/v1/clients/register/validate` |
| POST | `/api/v1/clients/register/complete` |

<!-- === END AUTO-GENERATED SECTION === -->
