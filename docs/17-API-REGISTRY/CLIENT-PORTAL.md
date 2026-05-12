# Client Portal API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Client Portal |
| **Route File(s)** | `server/features/client-portal/portal.router.ts`, `server/features/clients/portal.router.ts` |
| **Base Path(s)** | `/api/client-portal`, `/api/clients/:clientId/users`, `/api/v1/public/client-portal` |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | `client` for portal APIs; tenant admin/project manager for tenant-side user provisioning |
| **Tenant Scoped** | Yes. Portal APIs are scoped through `client_user_access`; tenant-side APIs verify tenant/client ownership. |

---

<!-- === MANUAL NOTES SECTION (safe to edit) === -->

## Notes / Gotchas

- Portal access has two active customer-facing levels: `portal_admin` and `collaborator`.
- Legacy `viewer` values are tolerated and treated as contributor-equivalent, but new UI should not offer Viewer.
- `GET /api/client-portal/clients/:clientId/users` is available to all portal users for visibility; create/update/delete routes require `portal_admin`.
- Portal task comment visibility is filtered. Portal users can see their own comments plus comments where they are explicitly mentioned.
- Direct portal provisioning uses `POST /api/client-portal/clients/:clientId/users/create` or tenant-side `POST /api/clients/:clientId/users/create` and sets password immediately.
- Invite provisioning uses `/users/invite` and the public invite acceptance endpoints under `/api/v1/public/client-portal`.

## Current Portal Route Surface

Customer portal routes are mounted under `/api/client-portal`:

- `GET/PATCH /clients/:clientId/overview`
- `GET/POST /clients/:clientId/contacts`
- `PATCH/DELETE /clients/:clientId/contacts/:contactId`
- `GET /clients/:clientId/users`
- `POST /clients/:clientId/users/invite`
- `POST /clients/:clientId/users/create`
- `PATCH/DELETE /clients/:clientId/users/:userId`
- `GET /dashboard`
- `GET /projects`
- `GET /projects/:projectId`
- `GET /tasks`
- `GET /tasks/:taskId`
- `PATCH /tasks/:taskId`
- `POST /tasks/:taskId/comments`
- `POST /tasks/:taskId/subtasks`
- `PATCH /subtasks/:subtaskId`
- `GET /profile`

Tenant-side portal user management routes are mounted under `/api/clients`:

- `GET /:clientId/users`
- `POST /:clientId/users/invite`
- `POST /:clientId/users/create`
- `PATCH/DELETE /:clientId/users/:userId`
- `GET /register/validate`
- `POST /register/complete`

Public invite routes are mounted under `/api/v1/public/client-portal`:

- `GET /invites/validate`
- `POST /invites/accept`

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
