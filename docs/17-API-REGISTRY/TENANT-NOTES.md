# tenant-notes API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | tenant-notes |
| **Route File(s)** | `server/routes/modules/super-admin/tenant-notes.router.ts` |
| **Base Path(s)** | /api/v1/tenants |

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

**Last Synced:** 2026-03-28T02:12:59.373Z

**Synced From:**
- `server/routes/modules/super-admin/tenant-notes.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/tenants/:tenantId/notes` |
| POST | `/api/v1/tenants/:tenantId/notes` |
| PATCH | `/api/v1/tenants/:tenantId/notes/:noteId` |
| GET | `/api/v1/tenants/:tenantId/notes/:noteId/versions` |
| DELETE | `/api/v1/tenants/:tenantId/notes/:noteId` |

<!-- === END AUTO-GENERATED SECTION === -->
