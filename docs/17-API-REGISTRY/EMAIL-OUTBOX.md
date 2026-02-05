# Email Outbox API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Email Outbox |
| **Route File(s)** | `server/routes/emailOutbox.ts` |
| **Base Path(s)** | /api/v1/tenant, /api/v1/super |

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

**Last Synced:** 2026-02-05T02:15:12.093Z

**Synced From:**
- `server/routes/emailOutbox.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenant/email-logs` |
| GET | `/api/v1/tenant/email-logs/stats` |
| POST | `/api/v1/tenant/email-logs/:emailId/resend` |
| GET | `/api/v1/super/email-logs` |
| GET | `/api/v1/super/email-logs/stats` |
| POST | `/api/v1/super/email-logs/:emailId/resend` |

<!-- === END AUTO-GENERATED SECTION === -->
