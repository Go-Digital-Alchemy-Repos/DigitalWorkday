# Client Portal API

**Status:** Current

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Client Portal |
| **Route File(s)** | `server/features/client-portal/portal.router.ts`, `server/features/clients/portal.router.ts` |
| **Base Path(s)** | `/api/client-portal`, `/api/v1/portal/support`, `/api/clients` |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | `client` for client-facing portal routes; tenant admin access for portal-user management routes |
| **Tenant Scoped** | Yes |

---

<!-- === MANUAL NOTES SECTION (safe to edit) === -->

## Notes / Gotchas

- Client-facing dashboard/project/task/profile routes are mounted through `server/features/client-portal/portal.router.ts` at `/api/client-portal`.
- Client-facing support routes are mounted through `server/features/client-portal/support.router.ts` at `/api/v1/portal/support`.
- Tenant-admin portal user management is mounted through `server/features/clients/portal.router.ts` at `/api/clients`.
- Internal client and project notes are intentionally not visible to portal users unless exposed through the explicit customer-access comment visibility model.

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-07-20T21:55:00-04:00

**Synced From:**
- `server/features/client-portal/portal.router.ts`
- `server/features/clients/portal.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/client-portal/dashboard` |
| GET | `/api/client-portal/projects` |
| GET | `/api/client-portal/projects/:projectId` |
| GET | `/api/client-portal/tasks` |
| GET | `/api/client-portal/tasks/:taskId` |
| POST | `/api/client-portal/tasks/:taskId/comments` |
| GET | `/api/client-portal/profile` |
| GET | `/api/v1/portal/support/tickets` |
| GET | `/api/v1/portal/support/tickets/:id` |
| POST | `/api/v1/portal/support/tickets` |
| POST | `/api/v1/portal/support/tickets/:id/messages` |
| GET | `/api/v1/portal/support/form-schemas/:category` |
| GET | `/api/clients/:clientId/users` |
| GET | `/api/clients/:clientId/access-scope-options` |
| POST | `/api/clients/:clientId/users/invite` |
| POST | `/api/clients/:clientId/users/setup` |
| POST | `/api/clients/:clientId/users/create` |
| GET | `/api/clients/:clientId/users/:userId/access-scope` |
| PATCH | `/api/clients/:clientId/users/:userId/access-scope` |
| PATCH | `/api/clients/:clientId/users/:userId` |
| DELETE | `/api/clients/:clientId/users/:userId` |
| GET | `/api/clients/register/validate` |
| POST | `/api/clients/register/complete` |

<!-- === END AUTO-GENERATED SECTION === -->
