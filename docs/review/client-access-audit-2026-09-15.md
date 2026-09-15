# Client Access Audit — 2026-09-15

## Implementation update

The release-blocking application changes identified below were implemented on
`feature/client-access-production-readiness` after this audit was completed:

- Client sessions are now denied from internal APIs by a centralized allowlist boundary, and internal route registrations use the `internalTenant` policy.
- Canonical invitations are linked to their client invite audit rows; revoke and resend rotate/update the real authentication token lifecycle.
- Portal access supports `all_visible` or explicit `selected` project grants, including direct project/task authorization checks and management UI controls.
- The Portal Users UI lists pending/expired/revoked invitations and supports resend and revoke actions.
- Policy, invitation, and project-isolation regression tests were added.

Migration `0063_client_access_hardening.sql` must be applied before deploying the branch. Staging role-matrix smoke testing and production migration verification remain deployment gates; the historical findings below are retained as the evidence that motivated the changes.

## Executive verdict

The client portal is a substantial working feature, not a placeholder. It has invite acceptance, dedicated client routing and navigation, two client roles, client-account access grants, portal-only project/task views, comments, files, messaging, approvals, support, profile management, and suspension controls.

It is **not ready to be described as isolated from the rest of the app**. The browser UI keeps client users in `/portal`, but the server's generic `authTenant` policy accepts any authenticated user with a tenant, including `client` users. Several internal routers mounted under that policy do not block the client role and expose internal read and mutation endpoints. This is a release blocker for external-client use.

The implemented access unit is also a **client account**, not an individual project. A grant exposes every non-private project and every non-private task belonging to that client account. There is no portal-project assignment model or project picker in the invite flow.

## What is set up

### Identity and invitations

- Tenant admins can create a portal user by email invite, generate a copyable invite link, or create credentials immediately.
- Invite tokens are generated randomly, stored as SHA-256 hashes, expire after seven days in the canonical `invitations` table, and are checked for accepted, revoked, and expired states.
- Invite acceptance creates or activates a `client` user, creates canonical `client_user_access` records, establishes a session, and routes the user into the portal.
- Existing internal-user email addresses are rejected for portal access.
- Login permits active client users and resolves their workspace from portal access if necessary.

### Roles and access management

- Two portal roles exist: `collaborator` and `client_admin`.
- Collaborators can work with portal tasks, comments, messages, approvals, support, and client-visible assets.
- Client Admins additionally manage the client overview, contacts, projects, activity, and other portal users.
- Tenant admins can create, edit, and revoke portal access from the Client Detail → Portal Users tab.
- Access can include the current client account and selected child/descendant client accounts.
- Portal Client Admins can invite, suspend/reactivate, demote/promote, and send password-reset links. The final active Client Admin cannot suspend or demote themself through the portal API.

### Portal experience

- Client users are redirected away from tenant and super-admin layouts into a dedicated `/portal` application shell.
- Portal pages exist for dashboard, account, projects, tasks, assets, activity, approvals, messages, support, and profile.
- Private projects and private tasks are excluded from portal queries.
- Internal comments default to hidden. Client-visible comments, a portal user's own comments, and comments explicitly mentioning that portal user can be returned.
- Client-scoped personal tasks are supported.
- Client-visible asset folders/files and tenant default documents are supported.
- Support tickets and client messaging have dedicated portal endpoints.

## Release-blocking findings

### P0 — Client-role sessions are not denied by default on internal APIs

`authTenant` only checks authentication and tenant context. It does not exclude `UserRole.CLIENT` (`server/http/policy/requiredMiddleware.ts:18-40`, `:54-58`). That makes every internal router dependent on remembering to add a separate client-role guard.

Confirmed examples without a client-role guard:

- `POST /api/workspaces` creates a workspace and makes the caller its owner (`server/http/domains/workspaces.router.ts:42-56`).
- `GET/POST /api/workspaces/:workspaceId/members` reads or adds workspace members without checking that the caller may manage that workspace (`server/http/domains/workspaces.router.ts:65-87`).
- `PATCH /api/workspaces/:id` updates a workspace without a role or ownership check (`server/http/domains/workspaces.router.ts:90-102`).
- `POST /api/teams` creates internal teams for the caller's tenant (`server/http/domains/teams.router.ts:65-89`).
- Internal tag endpoints allow creation, update, deletion, and task-tag mutation without a client-role block; several operations also use unscoped IDs (`server/http/domains/tags.router.ts:17-119`).
- The jobs API allows any authenticated tenant user to list tenant jobs and cancel a known tenant job; only queue statistics are restricted to super users (`server/jobs/jobs.router.ts`).
- The internal client-documents API verifies only that a client belongs to the same tenant, not that a portal user has a `client_user_access` grant for that client (`server/http/domains/clientDocuments.router.ts`).

The dedicated projects, tasks, subtasks, comments, CRM, internal assets, and user-directory paths have some explicit client-role blocks, but the boundary is deny-by-exception rather than deny-by-default.

**Required fix:** introduce an `internalTenant` policy (or make `authTenant` internal-only and create an explicit portal policy), apply it to internal routers centrally, and allow client users only through dedicated portal routers. Add a contract test that iterates every registered internal domain with a client session and expects 403.

### P0 — “Revoke invite” does not revoke the canonical invitation token

The active invite flow writes both a canonical `invitations` row and a `client_invites` audit row. The legacy `DELETE /api/clients/:clientId/invites/:inviteId` path only deletes the `client_invites` row (`server/routes/clients.router.ts:404-417`). Invite acceptance looks up the canonical invitation by token and treats the audit row as optional; if it is missing, acceptance still grants the root client account (`server/auth.ts`, tenant invite acceptance flow).

Therefore, using the documented legacy revoke endpoint can remove the visible/audit invite while leaving the emailed token usable.

**Required fix:** make pending-invite management operate on the canonical invitation ID, atomically set `invitations.status = 'revoked'`, and update the audit row. Remove or redirect the duplicate legacy invite routes.

## Important functional gaps

### P1 — Access is client-wide, not project-specific

The portal project list loops through every client in `client_user_access`, then returns every project whose visibility is not `private` (`server/features/client-portal/portal.router.ts:176-209`). Tasks are handled the same way (`:317-357`).

This supports “give this person access to Acme and all Acme portal-visible projects,” but not “invite this person to Project A and Project C only.”

**Required product decision:** either explicitly define the security model as client-account access plus `private` visibility, or add a `client_user_project_access`/portal-project-membership model and an invite/edit project picker. For the stated goal, project-level grants are the closer fit.

### P1 — Pending invitation management is missing from the main UI

The Portal Users tab loads active users, contacts, access-scope options, and access matrices. It does not list canonical pending invitations or provide resend/revoke controls. The only time the generated invite URL is available is immediately after creation.

**Required fix:** show pending, expired, accepted, and revoked invites; add resend, copy-new-link, and revoke actions; show delivery failure; and retain an audit trail.

### P1 — Tests validate selected routes, not the isolation boundary

The focused portal suite covers invite setup, route ordering, dedicated CRUD bypasses, capabilities, and personal tasks. Existing route-policy tests verify that routers declare `authTenant`; they do not verify that `client` sessions are rejected from every internal route. This is why all focused tests can pass while the P0 internal API exposure remains.

**Required fix:** add role-matrix integration tests at the registry/domain level and IDOR tests for arbitrary workspace, team, tag, document, job, attachment, and report IDs.

### P1 — Deployment state is not verified against this checkout

`https://digitalworkday.ai/health` reported healthy on 2026-09-15 with version `fc7cc9b`, while this checkout is at `1fd95b44`. The deployed SHA is not present in the local git object set, so parity could not be established. A read-only schema check against the configured database failed authentication, so migrations `0048`, `0049`, and `0055`–`0059` could not be confirmed as applied in that environment.

**Required fix:** identify the deployed branch/SHA, restore read-only migration verification, and run the client-role isolation suite against staging before inviting external users.

## Secondary risks and cleanup

### P2 — Portal task attachments use uploader role instead of explicit visibility

The portal lists and downloads task attachments only when the uploader's current user role is `client` (`server/features/client-portal/workspace.router.ts:459-471`, `:513-524`). This protects internal uploads, but it also prevents staff from deliberately sharing a task attachment with the client and can change historical visibility if a user's role changes.

Add explicit attachment visibility and snapshot uploader type. Default staff uploads to internal; allow deliberate client-visible sharing.

### P2 — Admin-set passwords create an account-takeover path

Tenant admins can create a portal user with a known password and later replace that password from the Portal Users sheet. That may be intentional for assisted setup, but it allows administrators to impersonate a client without a separate auditable impersonation flow.

Prefer invite/reset links. If direct credentials remain, require a forced password change, prominent audit events, and a clear policy.

### P2 — Duplicate/legacy authorization artifacts remain

Both `user_client_access` and canonical `client_user_access` remain in the schema. Migration `0055` copied legacy grants into the canonical table, but the legacy table and duplicate invitation/register routes remain. Schema comments still describe the invite mechanism as a future placeholder even though a canonical implementation exists.

Remove or clearly quarantine legacy tables/routes after a production migration audit, and update documentation to name one source of truth.

### P2 — Capabilities are broad role bundles

Capabilities are hardcoded by `collaborator` versus `client_admin`; there are no per-user toggles for view-only access, task creation, completion, comments, uploads, messages, approvals, or support. A collaborator can modify portal-visible work, not merely observe it.

Confirm that this matches the intended client contract. If some clients should be view-only, add a role or explicit capability grants before launch.

## UX and accessibility notes

- The deployed login screen is clear, compact, keyboard-addressable in its basic structure, includes visible labels, password reveal, forgot-password access, and Google sign-in.
- The invite acceptance implementation has distinct missing, loading, expired, used, revoked, invalid, and success states.
- The internal Portal Users setup presents setup method, access level, related client accounts, and comment-visibility expectations in one sheet. This is comprehensive but cognitively dense; project selection would add more complexity and should likely be a separate step.
- The client-admin Account page is implemented as a very dense single-line JSX layout with several unlabeled placeholder-driven inputs. Visible labels, confirmation dialogs for role/suspension changes, success/error messages, and responsive testing should be added.
- Screenshot evidence could only cover the deployed unauthenticated login entry because no safe client/admin test credentials were available. Authenticated keyboard order, focus restoration, contrast, responsive reflow, and screen-reader announcements remain unverified.

## Verification performed

- TypeScript check: passed.
- Focused client-access tests: 52 passed across 9 files.
- Route-policy tests: 118 passed across 7 files.
- Static tenancy scan: failed with 124 unscoped-storage matches. This is heuristic and includes false positives, but confirmed internal API issues above were manually reviewed.
- Broader heuristic tenant audit: 437 findings (276 warnings, 161 informational); not treated as 437 confirmed defects.
- Production health: healthy, version `fc7cc9b` at time of check.
- Configured database schema check: blocked by database password authentication failure.

## Recommended rollout sequence

1. Block client-role sessions from all internal tenant routers by default.
2. Repair canonical invitation lifecycle and revocation; remove duplicate invite paths.
3. Decide and implement the access unit: client account or selected projects.
4. Add registry-wide client-role denial tests and staging IDOR tests.
5. Verify deployed SHA and migration state in staging.
6. Add pending-invite management and explicit attachment visibility.
7. Run an authenticated admin → invite → accept → client participation → suspend/revoke UX and accessibility audit at desktop and mobile sizes.

## Step health summary

1. Admin finds Portal Users on Client Detail — **Good**.
2. Admin creates email invite, link, or direct credentials — **Mostly built; lifecycle controls incomplete**.
3. Invitee validates and accepts a token — **Built; deployed migration state unverified**.
4. Client is redirected into a dedicated portal shell — **Good at the frontend layer**.
5. Client sees assigned scope — **Incomplete: client-account-wide, not project-specific**.
6. Client participates in tasks/comments/assets/messages/approvals/support — **Broadly built**.
7. Internal information remains isolated — **Fail / release blocker at the API layer**.
8. Admin or Client Admin suspends/revokes access — **User suspension exists; invite revocation is unsafe/incoherent**.
