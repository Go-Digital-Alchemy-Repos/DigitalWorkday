# quarantine API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | quarantine |
| **Route File(s)** | `server/routes/modules/superDebug/quarantine.router.ts` |
| **Base Path(s)** | /api/v1/quarantine |

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

**Last Synced:** 2026-03-28T02:12:59.376Z

**Synced From:**
- `server/routes/modules/superDebug/quarantine.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/quarantine/summary` |
| GET | `/api/v1/quarantine/list` |
| POST | `/api/v1/quarantine/assign` |
| POST | `/api/v1/quarantine/archive` |
| POST | `/api/v1/quarantine/delete` |

<!-- === END AUTO-GENERATED SECTION === -->
