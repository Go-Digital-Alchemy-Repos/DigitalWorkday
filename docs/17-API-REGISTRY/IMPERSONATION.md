# impersonation API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | impersonation |
| **Route File(s)** | `server/routes/modules/super-admin/impersonation.router.ts` |
| **Base Path(s)** | /api/v1/impersonation, /api/v1/impersonate |

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
- `server/routes/modules/super-admin/impersonation.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/impersonation/exit` |
| GET | `/api/v1/impersonation/status` |
| POST | `/api/v1/impersonate/start` |
| POST | `/api/v1/impersonate/stop` |

<!-- === END AUTO-GENERATED SECTION === -->
