# Notifications API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Notifications |
| **Route File(s)** | `server/features/notifications/notifications.router.ts` |
| **Base Path(s)** | /api/v1/notifications |

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

`PATCH /api/notifications/preferences` accepts the existing `emailEnabled` boolean for the authenticated recipient. Its false default and existing values are preserved. The notification bell settings expose it as **Email notifications** under **Task Assignments**. It only enables new assignment emails from projects with `assignmentEmailsEnabled=true`; it does not gate existing mention, invitation, or password emails. In-app preferences are unchanged.

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-02-05T02:15:12.362Z

**Synced From:**
- `server/features/notifications/notifications.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/notifications/notifications` |
| GET | `/api/v1/notifications/notifications/unread-count` |
| PATCH | `/api/v1/notifications/notifications/:id/read` |
| POST | `/api/v1/notifications/notifications/mark-all-read` |
| DELETE | `/api/v1/notifications/notifications/:id` |
| GET | `/api/v1/notifications/notifications/preferences` |
| PATCH | `/api/v1/notifications/notifications/preferences` |

<!-- === END AUTO-GENERATED SECTION === -->
