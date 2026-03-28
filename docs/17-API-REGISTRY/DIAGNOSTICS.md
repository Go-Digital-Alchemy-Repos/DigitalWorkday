# diagnostics API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | diagnostics |
| **Route File(s)** | `server/routes/modules/super-admin/diagnostics.router.ts`, `server/routes/modules/superDebug/diagnostics.router.ts` |
| **Base Path(s)** | /api/v1/system, /api/v1/diagnostics, /api/v1/integrity, /api/v1/tenant-health, /api/v1/cache, /api/v1/config |

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

**Last Synced:** 2026-03-28T02:12:59.368Z

**Synced From:**
- `server/routes/modules/super-admin/diagnostics.router.ts`
- `server/routes/modules/superDebug/diagnostics.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/system/db-introspect` |
| GET | `/api/v1/diagnostics/schema` |
| GET | `/api/v1/integrity/checks` |
| POST | `/api/v1/tenant-health/recompute` |
| POST | `/api/v1/cache/invalidate` |
| GET | `/api/v1/config` |

<!-- === END AUTO-GENERATED SECTION === -->
