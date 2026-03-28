# docs API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | docs |
| **Route File(s)** | `server/routes/modules/super-admin/docs.router.ts` |
| **Base Path(s)** | /api/v1/docs |

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

**Last Synced:** 2026-03-28T02:12:59.369Z

**Synced From:**
- `server/routes/modules/super-admin/docs.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/docs` |
| GET | `/api/v1/docs/:docPath` |
| POST | `/api/v1/docs/sync` |
| GET | `/api/v1/docs/coverage` |

<!-- === END AUTO-GENERATED SECTION === -->
