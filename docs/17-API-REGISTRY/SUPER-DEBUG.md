# Super Debug API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Super Debug |
| **Route File(s)** | `server/routes/superDebug.ts` |
| **Base Path(s)** | /api/v1/super |

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

**Last Synced:** 2026-02-05T02:15:12.279Z

**Synced From:**
- `server/routes/superDebug.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/debug/quarantine/summary` |
| GET | `/api/v1/super/debug/quarantine/list` |
| POST | `/api/v1/super/debug/quarantine/assign` |
| POST | `/api/v1/super/debug/quarantine/archive` |
| POST | `/api/v1/super/debug/quarantine/delete` |
| GET | `/api/v1/super/debug/tenantid/scan` |
| POST | `/api/v1/super/debug/tenantid/backfill` |
| GET | `/api/v1/super/debug/integrity/checks` |
| POST | `/api/v1/super/debug/tenant-health/recompute` |
| POST | `/api/v1/super/debug/cache/invalidate` |
| GET | `/api/v1/super/debug/config` |

<!-- === END AUTO-GENERATED SECTION === -->
