# Time Tracking API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Time Tracking |
| **Route File(s)** | `server/routes/timeTracking.ts` |
| **Base Path(s)** | /api/timer/current, /api/timer/start, /api/timer/pause, /api/timer/resume, /api/timer/stop |

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

**Last Synced:** 2026-02-05T02:15:12.283Z

**Synced From:**
- `server/routes/timeTracking.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/timer/current` |
| POST | `/api/timer/start` |
| POST | `/api/timer/pause` |
| POST | `/api/timer/resume` |
| POST | `/api/timer/stop` |
| PATCH | `/api/timer/current` |
| DELETE | `/api/timer/current` |

<!-- === END AUTO-GENERATED SECTION === -->
