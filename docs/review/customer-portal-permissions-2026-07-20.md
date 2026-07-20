# Customer Portal Permissions Reassessment - 2026-07-20

## Implemented

- Portal access remains explicit per client account through `client_user_access`.
- Tenant admins can inspect and update a portal user's access matrix for the selected client and its child/descendant accounts.
- Invites and direct portal-user creation can carry selected child-account access.
- Both invite acceptance paths grant the selected client-account scope.
- Task comments now have explicit visibility:
  - `internal`
  - `client_visible`
- Tenant staff task comments default to `internal`.
- Portal-user task comments default to `client_visible`.
- Portal users can see:
  - `client_visible` comments
  - comments they authored
  - internal comments where they were explicitly mentioned
- The task comment composer now includes a `Share with client` control for internal users.

## Current Product Semantics

- Adding a portal user to a parent client does not invisibly grant all future child accounts.
- Admins can deliberately grant current child/descendant accounts from the portal-user access matrix.
- This is safer for auditability than automatic inheritance and prevents accidental exposure when a new subsidiary account is added later.

## Remaining Gaps

- Automatic future-child inheritance is not implemented. Add this later only if we want a durable rule such as "include future child accounts."
- The access matrix currently manages the selected client and descendants, not arbitrary sibling accounts outside that tree.
- Project-level and task-level portal visibility still rely on existing `visibility !== private` checks plus client access.
- Comment visibility is implemented for task comments surfaced in the portal task detail. Project-level discussion threads should receive the same model if/when they are exposed directly in the portal.
- The UI does not yet show a prominent warning when a tenant user mentions a portal user inside an internal comment. The backend behavior is safe, but a confirmation affordance would reduce accidental disclosure.

## Recommended Next Pass

1. Add an explicit "include future child accounts" scope rule only if customer operations need it.
2. Add a warning/confirmation when internal comments mention portal users.
3. Add a portal access audit trail for scope changes.
4. Review project-level discussions/messages and align them with the same `internal` versus `client_visible` behavior before exposing them more broadly.

