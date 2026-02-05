# Tenancy Health API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Tenancy Health |
| **Route File(s)** | `server/routes/tenancyHealth.ts` |
| **Base Path(s)** | /api/v1/super, /api/v1/tenant |

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

**Last Synced:** 2026-02-05T00:11:27.567Z

**Synced From:**
- `server/routes/tenancyHealth.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/tenancy/health` |
| GET | `/api/v1/super/tenancy/warnings` |
| POST | `/api/v1/super/tenancy/backfill` |
| GET | `/api/v1/tenant/tenancy/health` |
| GET | `/api/v1/super/health/orphans` |
| POST | `/api/v1/super/health/orphans/fix` |
| GET | `/api/v1/super/tenancy/constraints` |
| POST | `/api/v1/super/tenancy/constraints/apply` |
| POST | `/api/v1/super/tenancy/remediate` |
| GET | `/api/v1/super/migrations/status` |
| POST | `/api/v1/super/migrations/mark-applied` |

<!-- === END AUTO-GENERATED SECTION === -->
