# crm API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | crm |
| **Route File(s)** | `server/routes/crm.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.363Z

**Synced From:**
- `server/routes/crm.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/crm/clients/:clientId/summary` |
| GET | `/api/v1/crm/clients/:clientId/metrics` |
| PATCH | `/api/v1/crm/clients/:clientId/crm` |
| GET | `/api/v1/crm/pipeline` |
| GET | `/api/v1/crm/followups` |
| POST | `/api/v1/crm/bulk-update` |
| GET | `/api/v1/crm/clients/:clientId/activity` |
| GET | `/api/v1/crm/clients/:clientId/access` |
| POST | `/api/v1/crm/clients/:clientId/access` |
| DELETE | `/api/v1/crm/access/:id` |
| GET | `/api/v1/crm/portal/dashboard` |

<!-- === END AUTO-GENERATED SECTION === -->
