# Client Portal Staging QA - 2026-05-12

## Scope

End-of-day QA checklist for the Staging V2 client portal build-out.

## Core Access Model

- Customer Portal Admin can create, invite, edit, revoke, and reset passwords for portal users.
- Contributor can use client-facing areas but can only view portal users.
- Legacy `viewer` access records should behave as contributors.

## Smoke Flow

1. Tenant admin opens a client account and creates a portal admin with direct password provisioning.
2. Portal admin logs in and reaches `/portal` without agreement gate or workspace-access errors.
3. Portal admin confirms the sidebar shows tenant branding and the portal account name.
4. Portal admin creates a contributor from `/portal/users`.
5. Contributor logs in and confirms user-management controls are hidden or disabled.

## Portal Page Checks

| Page | Expected Result |
|------|-----------------|
| Overview | Account cards, project stats, open tasks, deadlines, and recent projects load |
| Contacts | Existing contacts appear; portal-created contacts appear in tenant Client Contacts |
| Projects | Client projects and visible task data load |
| Project Detail | Tasks and subtasks can be updated through portal APIs; comments are filtered by author or mention |
| Approvals | Assigned approval requests load and can be approved |
| Portal Users | Admin can manage; contributor can view only |
| Asset Library | Customer can upload, organize, edit, and delete client account assets |
| Messages | Customer can create conversations, support tickets, and service requests |
| Support Center | Customer support ticket submit enables with valid form data; rich text and attachments persist |

## Privacy Checks

- Portal users cannot see Divisions, Activity, or Notes.
- Portal users cannot access another client account by changing IDs in the URL.
- Untagged internal task comments are hidden from portal users.
- Portal users can see comments they authored.
- Portal users can see comments where they were explicitly mentioned.

## Tenant-Side Checks

- Portal-created contacts appear in tenant Client Contacts.
- Portal-created users appear in tenant Portal Users.
- Support tickets created by customers appear once in Support Center.
- Service requests route to Service Requests and are visible to admins/project managers.

## Automated Verification

Run:

```bash
npm run check
npm test
npm run test:http
npm run test:db
npm run build
```

If time is limited, prioritize `npm run check`, `npm test`, and `npm run build`.

## 2026-05-12 Local Run Results

| Command | Result | Notes |
|---------|--------|-------|
| `npm run check` | Passed | TypeScript completed with no errors |
| `npm test` | Passed | 51 test files, 596 tests |
| `npm run build` | Passed | Production client/server build completed |
| `npm run test:http` | Blocked locally | 15 files passed, 13 failed; failures are dominated by missing local Postgres (`ECONNREFUSED localhost:5432`) plus existing unauthenticated-route expectation mismatches |
| `npm run test:db` | Blocked locally | Local Postgres was unavailable; DB-backed tests failed on connection setup |
| `npm run test:all` | Blocked locally | 86 files passed, 49 failed; failure pattern matches the HTTP/DB blocker above |

Run DB-backed suites again against a staging-like database before promotion.
