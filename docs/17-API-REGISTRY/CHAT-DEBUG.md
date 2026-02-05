# Chat Debug API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Chat Debug |
| **Route File(s)** | `server/routes/chatDebug.ts` |
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

**Last Synced:** 2026-02-05T00:11:27.561Z

**Synced From:**
- `server/routes/chatDebug.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/super/debug/chat/metrics` |
| GET | `/api/v1/super/debug/chat/events` |
| GET | `/api/v1/super/debug/chat/sockets` |
| GET | `/api/v1/super/debug/chat/status` |
| GET | `/api/v1/super/debug/chat/diagnostics` |

<!-- === END AUTO-GENERATED SECTION === -->
