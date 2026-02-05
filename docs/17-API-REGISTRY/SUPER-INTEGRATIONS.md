# Super Integrations API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Super Integrations |
| **Route File(s)** | `server/routes/super/integrations.router.ts` |
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

**Last Synced:** 2026-02-05T00:11:27.562Z

**Synced From:**
- `server/routes/super/integrations.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/integrations/status` |
| GET | `/api/v1/super/integrations/mailgun` |
| PUT | `/api/v1/super/integrations/mailgun` |
| POST | `/api/v1/super/integrations/mailgun/test` |
| POST | `/api/v1/super/integrations/mailgun/send-test-email` |
| DELETE | `/api/v1/super/integrations/mailgun/secret/:secretName` |
| GET | `/api/v1/super/integrations/stripe` |
| PUT | `/api/v1/super/integrations/stripe` |
| POST | `/api/v1/super/integrations/stripe/test` |
| DELETE | `/api/v1/super/integrations/stripe/secret/:secretName` |

<!-- === END AUTO-GENERATED SECTION === -->
