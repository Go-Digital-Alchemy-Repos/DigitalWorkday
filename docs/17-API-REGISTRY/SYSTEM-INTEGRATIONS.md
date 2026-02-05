# System Integrations API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | System Integrations |
| **Route File(s)** | `server/routes/systemIntegrations.ts` |
| **Base Path(s)** | /api/v1/system |

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

**Last Synced:** 2026-02-05T00:11:27.566Z

**Synced From:**
- `server/routes/systemIntegrations.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/system/integrations` |
| GET | `/api/v1/system/integrations/s3` |
| PUT | `/api/v1/system/integrations/s3` |
| POST | `/api/v1/system/integrations/s3/test` |
| DELETE | `/api/v1/system/integrations/s3/secret/:secretName` |
| GET | `/api/v1/system/integrations/r2` |
| PUT | `/api/v1/system/integrations/r2` |
| POST | `/api/v1/system/integrations/r2/test` |
| GET | `/api/v1/system/storage/status` |
| GET | `/api/v1/system/integrations/sso/google` |
| PUT | `/api/v1/system/integrations/sso/google` |
| POST | `/api/v1/system/integrations/sso/google/test` |
| GET | `/api/v1/system/integrations/sso/status` |
| GET | `/api/v1/system/integrations/openai` |
| PUT | `/api/v1/system/integrations/openai` |
| POST | `/api/v1/system/integrations/openai/test` |

<!-- === END AUTO-GENERATED SECTION === -->
