# System Status API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | System Status |
| **Route File(s)** | `server/routes/systemStatus.ts` |
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

**Last Synced:** 2026-02-05T02:15:12.281Z

**Synced From:**
- `server/routes/systemStatus.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/status/health/db` |
| GET | `/api/v1/super/status/summary` |
| GET | `/api/v1/super/status/permissions-audit` |
| GET | `/api/v1/super/status/error-logs` |
| GET | `/api/v1/super/status/error-logs/:id` |
| PATCH | `/api/v1/super/status/error-logs/:id/resolve` |
| GET | `/api/v1/super/status/diagnostics/schema` |

<!-- === END AUTO-GENERATED SECTION === -->
