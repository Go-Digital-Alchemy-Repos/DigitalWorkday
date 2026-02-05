# AI API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | AI |
| **Route File(s)** | `server/routes/ai.ts` |
| **Base Path(s)** | /api/v1/ai |

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

**Last Synced:** 2026-02-05T00:11:27.559Z

**Synced From:**
- `server/routes/ai.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/ai/status` |
| POST | `/api/v1/ai/suggest/task-breakdown` |
| POST | `/api/v1/ai/suggest/project-plan` |
| POST | `/api/v1/ai/suggest/task-description` |

<!-- === END AUTO-GENERATED SECTION === -->
