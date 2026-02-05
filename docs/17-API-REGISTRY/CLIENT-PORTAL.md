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

**Last Synced:** 2026-02-05T02:15:12.285Z

**Synced From:**
- `server/features/client-portal/portal.router.ts`
- `server/features/clients/portal.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/clients/dashboard` |
| GET | `/api/clients/projects` |
| GET | `/api/clients/projects/:projectId` |
| GET | `/api/clients/tasks` |
| GET | `/api/clients/tasks/:taskId` |
| POST | `/api/clients/tasks/:taskId/comments` |
| GET | `/api/clients/profile` |
| GET | `/api/clients/:clientId/users` |
| POST | `/api/clients/:clientId/users/invite` |
| PATCH | `/api/clients/:clientId/users/:userId` |
| DELETE | `/api/clients/:clientId/users/:userId` |
| GET | `/api/clients/register/validate` |
| POST | `/api/clients/register/complete` |

<!-- === END AUTO-GENERATED SECTION === -->
