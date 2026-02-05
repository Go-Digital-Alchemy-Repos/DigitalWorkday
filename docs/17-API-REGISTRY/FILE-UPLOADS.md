# File Uploads API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | File Uploads |
| **Route File(s)** | `server/routes/uploads.ts` |
| **Base Path(s)** | /api/v1/uploads |

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

**Last Synced:** 2026-02-05T00:11:27.569Z

**Synced From:**
- `server/routes/uploads.ts`

### Endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/uploads/presign` |
| GET | `/api/v1/uploads/status` |
| POST | `/api/v1/uploads/upload` |

<!-- === END AUTO-GENERATED SECTION === -->
