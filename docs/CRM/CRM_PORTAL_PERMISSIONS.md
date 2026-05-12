# Client Portal Permissions

**Last Updated:** 2026-05-12

## Overview

The client portal gives external customer users access to the client-facing areas of their own account. Portal users are always scoped by `client_user_access.client_id`; they must never see data for another client account.

The product now uses two customer-facing portal access levels:

| Access Level | Stored Value | Purpose |
|--------------|--------------|---------|
| Customer Portal Admin | `portal_admin` | Full portal use plus portal-user administration and password control |
| Contributor | `collaborator` | Full portal use except creating, editing, deleting, or resetting other portal users |

Legacy `viewer` records are treated as contributors so older accounts continue to work, but new UI flows should not offer `viewer`.

## Capability Matrix

| Area | Portal Admin | Contributor |
|------|--------------|-------------|
| Overview | View and edit account overview | View and edit account overview |
| Contacts | Full CRUD; contacts also appear in tenant Client Contacts | Full CRUD; contacts also appear in tenant Client Contacts |
| Projects and tasks | View, update, comment, and participate in visible projects/tasks/subtasks | Same |
| Task comments | Can see own comments and comments where explicitly mentioned | Same |
| Internal task comments | Hidden unless explicitly mentioned | Hidden unless explicitly mentioned |
| Approvals | View and approve assigned approval requests | Same |
| Portal Users | Create, invite, edit, revoke, and reset passwords | View only |
| Asset Library | Full CRUD | Full CRUD |
| Messages | Full client-facing messaging access | Full client-facing messaging access |
| Support Center | Full client-facing support access | Full client-facing support access |
| Service Requests | Full client-facing service request access | Full client-facing service request access |

## Internal Data Boundaries

- Portal users have application role `client`.
- Tenant users remain responsible for internal-only areas: Divisions, Activity, Notes, tenant-only project management controls, and untagged internal comments.
- A portal user can only load records tied to one of their accessible `client_user_access` records.
- Task comments are filtered: a portal user sees comments they authored and comments where they are explicitly mentioned in `comment_mentions`.
- Support tickets and service requests created by customers route to tenant-side processing views without exposing unrelated tenant data.

## Portal Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/portal` | Customer account overview | Client role |
| `/portal/contacts` | Client account contacts | Client role |
| `/portal/projects` | Client projects | Client role |
| `/portal/projects/:id` | Project task view | Client role |
| `/portal/approvals` | Approval requests | Client role |
| `/portal/users` | Portal users list/admin | Client role; mutation requires `portal_admin` |
| `/portal/assets` | Asset library | Client role |
| `/portal/messages` | Client-facing messages | Client role |
| `/portal/support` | Support Center | Client role |
| `/portal/profile` | Customer profile and password management | Client role |

## Invitation and Provisioning

Tenant admins and customer portal admins can create portal users in two ways:

1. Send invite: creates a pending invite and emails a setup link.
2. Direct provision: creates the portal user, assigns access, and sets a password immediately.

Directly provisioned users must also appear in the tenant-side Portal Users view because both sides use the same `users` and `client_user_access` records.

## Staging QA Checklist

- Create a portal admin from a tenant client account and log in without invite email.
- Confirm overview, contacts, projects, portal users, assets, messages, and support load.
- Confirm a contributor can view portal users but cannot create, edit, revoke, or reset passwords.
- Confirm a portal admin can create a contributor and another portal admin.
- Confirm contacts created in portal appear in tenant Client Contacts.
- Confirm project task comments remain hidden unless the portal user authored them or was mentioned.
- Confirm support tickets created by a customer appear once in Support Center and can include rich text plus attachments.
