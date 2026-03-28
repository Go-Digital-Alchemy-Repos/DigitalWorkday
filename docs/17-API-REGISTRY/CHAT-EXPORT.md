# chat Export API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | chat Export |
| **Route File(s)** | `server/routes/super/chatExport.router.ts` |
| **Base Path(s)** | /api/v1/exports |

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
- `server/routes/super/chatExport.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/exports` |
| GET | `/api/v1/exports` |
| GET | `/api/v1/exports/:id` |
| GET | `/api/v1/exports/:id/download` |

<!-- === END AUTO-GENERATED SECTION === -->
