# conversations API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | conversations |
| **Route File(s)** | `server/routes/modules/crm/conversations.router.ts` |
| **Base Path(s)** | /api/v1/crm |

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

**Last Synced:** 2026-03-28T02:12:59.364Z

**Synced From:**
- `server/routes/modules/crm/conversations.router.ts`

### Endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/crm/clients/:clientId/conversations` |
| GET | `/api/v1/crm/clients/:clientId/conversations/counts` |
| POST | `/api/v1/crm/clients/:clientId/conversations` |
| PATCH | `/api/v1/crm/conversations/:conversationId/assign` |
| GET | `/api/v1/crm/conversations/:conversationId/messages` |
| POST | `/api/v1/crm/conversations/:conversationId/read` |
| POST | `/api/v1/crm/conversations/:conversationId/messages` |
| POST | `/api/v1/crm/conversations/:conversationId/merge` |
| GET | `/api/v1/crm/conversations/:conversationId/duplicates` |
| GET | `/api/v1/crm/clients/:clientId/conversations/merge-candidates` |
| GET | `/api/v1/crm/portal/conversations` |
| GET | `/api/v1/crm/conversation-sla-policies` |
| POST | `/api/v1/crm/conversation-sla-policies` |
| PATCH | `/api/v1/crm/conversation-sla-policies/:policyId` |
| DELETE | `/api/v1/crm/conversation-sla-policies/:policyId` |
| POST | `/api/v1/crm/conversation-sla-evaluate` |
| PATCH | `/api/v1/crm/conversations/:conversationId/priority` |
| POST | `/api/v1/crm/conversations/:conversationId/close` |
| POST | `/api/v1/crm/conversations/:conversationId/reopen` |
| GET | `/api/v1/crm/message-permissions` |
| GET | `/api/v1/crm/conversation-settings` |
| PATCH | `/api/v1/crm/conversation-settings` |

<!-- === END AUTO-GENERATED SECTION === -->
