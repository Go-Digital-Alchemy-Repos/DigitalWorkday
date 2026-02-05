# Chat Retention API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Chat Retention |
| **Route File(s)** | `server/routes/chatRetention.ts` |
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

**Last Synced:** 2026-02-05T02:15:12.092Z

**Synced From:**
- `server/routes/chatRetention.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/chat/retention` |
| PATCH | `/api/v1/super/chat/retention` |
| POST | `/api/v1/super/chat/archive/run` |
| GET | `/api/v1/super/chat/archive/stats` |
| GET | `/api/v1/tenant/chat/retention` |
| PATCH | `/api/v1/tenant/chat/retention` |
| POST | `/api/v1/tenant/chat/export/:threadType/:threadId` |

<!-- === END AUTO-GENERATED SECTION === -->
