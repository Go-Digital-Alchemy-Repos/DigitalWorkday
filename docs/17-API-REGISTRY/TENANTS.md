# tenants API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenants |
| **Route File(s)** | `server/routes/modules/super-admin/tenants.router.ts` |
| **Base Path(s)** | /api/v1/tenants, /api/v1/tenants-detail |

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
- `server/routes/modules/super-admin/tenants.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenants` |
| GET | `/api/v1/tenants/:id` |
| POST | `/api/v1/tenants` |
| PATCH | `/api/v1/tenants/:id` |
| POST | `/api/v1/tenants/:tenantId/activate` |
| POST | `/api/v1/tenants/:tenantId/suspend` |
| POST | `/api/v1/tenants/:tenantId/deactivate` |
| DELETE | `/api/v1/tenants/:tenantId` |
| POST | `/api/v1/tenants/:tenantId/invite-admin` |
| GET | `/api/v1/tenants/:tenantId/onboarding-status` |
| GET | `/api/v1/tenants-detail` |
| GET | `/api/v1/tenants/picker` |

<!-- === END AUTO-GENERATED SECTION === -->
