# agreements API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | agreements |
| **Route File(s)** | `server/routes/modules/super-admin/agreements.router.ts` |
| **Base Path(s)** | /api/v1/agreements |

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

**Last Synced:** 2026-03-28T02:12:59.367Z

**Synced From:**
- `server/routes/modules/super-admin/agreements.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/agreements/tenants-summary` |
| GET | `/api/v1/agreements` |
| GET | `/api/v1/agreements/:id` |
| POST | `/api/v1/agreements` |
| PATCH | `/api/v1/agreements/:id` |
| POST | `/api/v1/agreements/:id/publish` |
| POST | `/api/v1/agreements/:id/archive` |
| DELETE | `/api/v1/agreements/:id` |
| GET | `/api/v1/agreements/:id/signers` |

<!-- === END AUTO-GENERATED SECTION === -->
