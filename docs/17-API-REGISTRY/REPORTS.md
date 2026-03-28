# reports API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | reports |
| **Route File(s)** | `server/routes/modules/super-admin/reports.router.ts` |
| **Base Path(s)** | /api/v1/reports |

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
- `server/routes/modules/super-admin/reports.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/reports/tenants-summary` |
| GET | `/api/v1/reports/projects-summary` |
| GET | `/api/v1/reports/users-summary` |
| GET | `/api/v1/reports/tasks-summary` |
| GET | `/api/v1/reports/time-summary` |

<!-- === END AUTO-GENERATED SECTION === -->
