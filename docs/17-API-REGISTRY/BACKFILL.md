# backfill API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | backfill |
| **Route File(s)** | `server/routes/modules/superDebug/backfill.router.ts` |
| **Base Path(s)** | /api/v1/tenantid |

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
- `server/routes/modules/superDebug/backfill.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenantid/scan` |
| POST | `/api/v1/tenantid/backfill` |

<!-- === END AUTO-GENERATED SECTION === -->
