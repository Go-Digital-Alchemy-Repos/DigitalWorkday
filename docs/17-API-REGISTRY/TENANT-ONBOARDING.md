# Tenant Onboarding API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Tenant Onboarding |
| **Route File(s)** | `server/routes/tenantOnboarding.ts` |
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
- `server/routes/tenantOnboarding.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenant/context` |
| GET | `/api/v1/tenant/me` |
| PATCH | `/api/v1/tenant/settings` |
| GET | `/api/v1/tenant/onboarding/status` |
| POST | `/api/v1/tenant/onboarding/complete` |
| GET | `/api/v1/tenant/branding` |
| GET | `/api/v1/tenant/settings` |
| GET | `/api/v1/tenant/integrations` |
| GET | `/api/v1/tenant/integrations/:provider` |
| PUT | `/api/v1/tenant/integrations/:provider` |
| POST | `/api/v1/tenant/integrations/:provider/test` |
| POST | `/api/v1/tenant/integrations/mailgun/send-test-email` |
| GET | `/api/v1/tenant/storage/status` |
| POST | `/api/v1/tenant/settings/brand-assets` |
| GET | `/api/v1/tenant/agreement` |
| POST | `/api/v1/tenant/agreement/draft` |
| PATCH | `/api/v1/tenant/agreement/draft` |
| POST | `/api/v1/tenant/agreement/publish` |
| POST | `/api/v1/tenant/agreement/unpublish` |
| GET | `/api/v1/tenant/agreement/stats` |

<!-- === END AUTO-GENERATED SECTION === -->
