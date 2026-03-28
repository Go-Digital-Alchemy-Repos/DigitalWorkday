# seeding API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | seeding |
| **Route File(s)** | `server/routes/modules/super-admin/seeding.router.ts` |
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

**Last Synced:** 2026-03-28T02:12:59.370Z

**Synced From:**
- `server/routes/modules/super-admin/seeding.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/tenants/:tenantId/seed/welcome-project` |
| POST | `/api/v1/tenants/:tenantId/projects/:projectId/seed/task-template` |

<!-- === END AUTO-GENERATED SECTION === -->
