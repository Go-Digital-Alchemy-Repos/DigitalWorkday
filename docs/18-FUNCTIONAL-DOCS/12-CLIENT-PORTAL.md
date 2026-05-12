# Client Portal

**Status:** In Progress  
**Last Updated:** 2026-05-12

## What It Is

The Client Portal is the customer-facing side of the app. It lets external client users manage client-facing account data, collaborate on visible project work, exchange messages, submit support tickets, create service requests, manage assets, and respond to approvals.

## Roles

| Role | Stored Access | Summary |
|------|---------------|---------|
| Customer Portal Admin | `portal_admin` | Full portal access plus portal user management and password control |
| Contributor | `collaborator` | Full portal access except managing other portal users |

Legacy `viewer` records remain supported as contributor-equivalent access.

## Included Areas

- Overview
- Contacts
- Projects and visible tasks/subtasks
- Approvals
- Portal Users
- Asset Library
- Messages
- Support Center
- Service Requests

## Excluded Areas

Portal users must not see:

- Divisions
- Activity
- Notes
- Data for other client accounts
- Internal project/task comments unless explicitly mentioned

## Comment Visibility Rule

Task and subtask comments are sensitive because tenant users may discuss internal work. Portal comment visibility must follow this rule:

- Show comments authored by the portal user.
- Show comments where the portal user is explicitly mentioned.
- Hide all other comments.

## User Management Rule

Portal Admins can create, invite, edit, revoke, and reset passwords for portal users on their client account.

Contributors can view other portal users for account awareness but cannot control them.

## QA Focus

Before promoting staging changes, verify:

- Direct provisioning works without invite email.
- Portal admin can create a contributor and another portal admin.
- Contributor cannot access portal user management controls.
- Contacts created in the portal appear in tenant Client Contacts.
- Support tickets submit once and render rich text/attachments.
- Portal project/task data is scoped to the correct client account.
