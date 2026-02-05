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

*Add manual notes here. This section will be preserved during sync.*

<!-- === END MANUAL NOTES SECTION === -->

---

<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->

**Last Synced:** 2026-02-05T00:11:27.577Z

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
