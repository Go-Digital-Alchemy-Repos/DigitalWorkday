# Tenant Billing API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Tenant Billing |
| **Route File(s)** | `server/routes/tenantBilling.ts` |
| **Base Path(s)** | /api/v1/tenant |

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

**Last Synced:** 2026-02-05T00:11:27.568Z

**Synced From:**
- `server/routes/tenantBilling.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenant/billing` |
| POST | `/api/v1/tenant/billing/initialize` |
| POST | `/api/v1/tenant/billing/portal-session` |
| GET | `/api/v1/tenant/billing/invoices` |
| PATCH | `/api/v1/tenant/billing/email` |

<!-- === END AUTO-GENERATED SECTION === -->
