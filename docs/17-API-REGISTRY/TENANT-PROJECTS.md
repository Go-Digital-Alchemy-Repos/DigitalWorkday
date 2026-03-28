# tenant-projects API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant-projects |
| **Route File(s)** | `server/routes/modules/super-admin/tenant-projects.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.374Z

**Synced From:**
- `server/routes/modules/super-admin/tenant-projects.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/tenants/:tenantId/projects/bulk` |
| GET | `/api/v1/tenants/:tenantId/projects` |
| POST | `/api/v1/tenants/:tenantId/projects` |
| PATCH | `/api/v1/tenants/:tenantId/projects/:projectId` |
| DELETE | `/api/v1/tenants/:tenantId/projects/:projectId` |

<!-- === END AUTO-GENERATED SECTION === -->
