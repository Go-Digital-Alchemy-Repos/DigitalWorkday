# Super Chat API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Super Chat |
| **Route File(s)** | `server/routes/superChat.ts` |
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

**Last Synced:** 2026-02-05T02:15:12.199Z

**Synced From:**
- `server/routes/superChat.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/chat/tenants/:tenantId/threads` |
| GET | `/api/v1/super/chat/tenants/:tenantId/channels/:channelId/messages` |
| GET | `/api/v1/super/chat/tenants/:tenantId/dms/:dmId/messages` |
| GET | `/api/v1/super/chat/search` |

<!-- === END AUTO-GENERATED SECTION === -->
