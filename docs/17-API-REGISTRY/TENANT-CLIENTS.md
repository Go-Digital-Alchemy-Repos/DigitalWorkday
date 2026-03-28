# tenant-clients API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant-clients |
| **Route File(s)** | `server/routes/modules/super-admin/tenant-clients.router.ts` |
| **Base Path(s)** | /api/v1/tenants |

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

**Last Synced:** 2026-03-28T02:12:59.372Z

**Synced From:**
- `server/routes/modules/super-admin/tenant-clients.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/tenants/:tenantId/clients/bulk` |
| GET | `/api/v1/tenants/:tenantId/clients` |
| POST | `/api/v1/tenants/:tenantId/clients` |
| POST | `/api/v1/tenants/:tenantId/clients/fix-tenant-ids` |
| PATCH | `/api/v1/tenants/:tenantId/clients/:clientId` |
| DELETE | `/api/v1/tenants/:tenantId/clients/:clientId` |

<!-- === END AUTO-GENERATED SECTION === -->
