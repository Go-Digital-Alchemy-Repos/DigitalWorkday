# Chat API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Chat |
| **Route File(s)** | `server/http/domains/chat.router.ts` |
| **Base Path(s)** | /api/v1/chat |

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

**Last Synced:** 2026-02-05T02:15:12.089Z

**Synced From:**
- `server/http/domains/chat.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/chat/users` |
| GET | `/api/v1/chat/channels` |
| GET | `/api/v1/chat/channels/my` |
| POST | `/api/v1/chat/channels` |
| GET | `/api/v1/chat/channels/:channelId` |
| GET | `/api/v1/chat/channels/:channelId/members` |
| POST | `/api/v1/chat/channels/:channelId/join` |
| DELETE | `/api/v1/chat/channels/:channelId/leave` |
| GET | `/api/v1/chat/channels/:channelId/messages` |
| POST | `/api/v1/chat/channels/:channelId/messages` |
| GET | `/api/v1/chat/dm` |
| POST | `/api/v1/chat/dm` |
| GET | `/api/v1/chat/dm/:dmId` |
| GET | `/api/v1/chat/dm/:dmId/messages` |
| POST | `/api/v1/chat/dm/:dmId/messages` |
| PATCH | `/api/v1/chat/messages/:messageId` |
| DELETE | `/api/v1/chat/messages/:messageId` |
| POST | `/api/v1/chat/uploads` |
| POST | `/api/v1/chat/reads` |
| PATCH | `/api/v1/chat/messages/:id` |
| DELETE | `/api/v1/chat/messages/:id` |
| GET | `/api/v1/chat/search` |
| GET | `/api/v1/chat/users/mentionable` |
| POST | `/api/v1/chat/channels/:channelId/members` |
| DELETE | `/api/v1/chat/channels/:channelId/members/:userId` |

<!-- === END AUTO-GENERATED SECTION === -->
