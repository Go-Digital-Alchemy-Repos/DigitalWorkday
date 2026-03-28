# admins API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | admins |
| **Route File(s)** | `server/routes/modules/super-admin/admins.router.ts` |
| **Base Path(s)** | /api/v1/admins |

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

**Last Synced:** 2026-03-28T02:12:59.366Z

**Synced From:**
- `server/routes/modules/super-admin/admins.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/admins` |
| GET | `/api/v1/admins/:id` |
| POST | `/api/v1/admins` |
| PATCH | `/api/v1/admins/:id` |
| DELETE | `/api/v1/admins/:id` |
| POST | `/api/v1/admins/:id/invite` |
| GET | `/api/v1/admins/:id/audit-events` |
| POST | `/api/v1/admins/:id/provision` |

<!-- === END AUTO-GENERATED SECTION === -->
