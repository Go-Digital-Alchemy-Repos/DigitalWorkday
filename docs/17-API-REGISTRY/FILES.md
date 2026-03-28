# files API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | files |
| **Route File(s)** | `server/routes/modules/crm/files.router.ts` |
| **Base Path(s)** | /api/v1/crm |

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

**Last Synced:** 2026-03-28T02:12:59.365Z

**Synced From:**
- `server/routes/modules/crm/files.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/crm/clients/:clientId/files` |
| POST | `/api/v1/crm/clients/:clientId/files` |
| PATCH | `/api/v1/crm/files/:id` |
| DELETE | `/api/v1/crm/files/:id` |

<!-- === END AUTO-GENERATED SECTION === -->
