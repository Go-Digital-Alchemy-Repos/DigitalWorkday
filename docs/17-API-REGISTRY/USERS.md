# users API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | users |
| **Route File(s)** | `server/routes/modules/super-admin/users.router.ts`, `server/routes/users.router.ts` |
| **Base Path(s)** | /api/v1/users, /api/v1/tenant, /api/v1/invitations, /api/v1/settings, /api/v1/v1 |

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

**Last Synced:** 2026-03-28T02:12:59.375Z

**Synced From:**
- `server/routes/modules/super-admin/users.router.ts`
- `server/routes/users.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/users/orphaned` |
| GET | `/api/v1/users` |
| GET | `/api/v1/users/:userId/activity` |
| PATCH | `/api/v1/users/:userId` |
| POST | `/api/v1/users/:userId/avatar` |
| DELETE | `/api/v1/users/:userId/avatar` |
| POST | `/api/v1/users/:userId/set-password` |
| POST | `/api/v1/users/:userId/generate-reset-link` |
| DELETE | `/api/v1/users/:userId` |
| GET | `/api/v1/users` |
| GET | `/api/v1/tenant/users` |
| POST | `/api/v1/users` |
| PATCH | `/api/v1/users/me` |
| POST | `/api/v1/users/me/change-password` |
| GET | `/api/v1/users/me/ui-preferences` |
| PATCH | `/api/v1/users/me/ui-preferences` |
| PATCH | `/api/v1/users/:id` |
| POST | `/api/v1/users/:id/reset-password` |
| POST | `/api/v1/users/:id/activate` |
| POST | `/api/v1/users/:id/deactivate` |
| DELETE | `/api/v1/users/:id` |
| POST | `/api/v1/users/:id/generate-reset-link` |
| GET | `/api/v1/users/:id/activity-summary` |
| GET | `/api/v1/invitations` |
| POST | `/api/v1/invitations` |
| DELETE | `/api/v1/invitations/:id` |
| POST | `/api/v1/invitations/for-user` |
| GET | `/api/v1/settings/mailgun` |
| PUT | `/api/v1/settings/mailgun` |
| POST | `/api/v1/settings/mailgun/test` |
| POST | `/api/v1/v1/me/avatar` |
| DELETE | `/api/v1/v1/me/avatar` |
| GET | `/api/v1/v1/me/agreement/status` |
| POST | `/api/v1/v1/me/agreement/accept` |

<!-- === END AUTO-GENERATED SECTION === -->
