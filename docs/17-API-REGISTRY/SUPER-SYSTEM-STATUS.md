# Super System Status API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Super System Status |
| **Route File(s)** | `server/routes/super/systemStatus.router.ts` |
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

**Last Synced:** 2026-02-05T00:11:27.563Z

**Synced From:**
- `server/routes/super/systemStatus.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/status/health` |
| GET | `/api/v1/super/status/auth-diagnostics` |
| GET | `/api/v1/super/status/db` |
| POST | `/api/v1/super/status/checks/:type` |

<!-- === END AUTO-GENERATED SECTION === -->
