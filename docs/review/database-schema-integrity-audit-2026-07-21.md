# Database Schema and Integrity Audit - 2026-07-21

## Scope

Reviewed the committed Drizzle schema, SQL migrations, migration journal, startup schema readiness checks, tenancy guardrails, and focused database smoke tests. The pass focused on production/staging safety for customer portal access, division visibility, comment visibility, and migration drift detection.

## Findings Fixed

### High - `user_client_access` existed in code but not in migrations

Evidence:
- `shared/schema.ts` defined `user_client_access`.
- `server/routes/crm.router.ts` inserts and reads `user_client_access.workspace_id` and `user_client_access.access_level`.
- No committed migration created `user_client_access`, and the schema definition omitted the two columns used by the route.

Remediation:
- Added `migrations/0049_user_client_access_integrity.sql`.
- Added idempotent table creation, missing-column repair, indexes, unique index, and foreign key constraints.
- Updated `migrations/meta/_journal.json`.
- Aligned `shared/schema.ts` with runtime fields: `workspaceId`, `accessLevel`, and `user_client_access_workspace_idx`.

### Medium - Startup readiness did not cover recent portal access schema

Evidence:
- `server/startup/schemaReadiness.ts` checked core tables and chat/task migrations but not customer portal access tables, division tables, comment mentions, or `comments.visibility`.
- A Railway environment could pass readiness while missing schema needed by the customer portal.

Remediation:
- Added readiness coverage for `client_divisions`, `division_members`, `client_user_access`, `user_client_access`, and `comment_mentions`.
- Added readiness coverage for portal-critical columns including `client_invites.access_client_ids`, `comments.visibility`, and portal access keys.
- Added regression tests that block readiness/baselining when customer portal access schema is missing.

### Low - Comment visibility default should be reinforced during migration

Evidence:
- The application expects task comments to default to `internal` unless deliberately made client-visible.
- `0048_customer_access_permissions.sql` added `comments.visibility` with the right default for normal migration paths.

Remediation:
- Added an explicit `ALTER COLUMN visibility SET DEFAULT 'internal'` to make the migration resilient if the column already exists from drift or manual repair.

## Integrity Assessment

Strong areas:
- Migrations are journaled and smoke-tested.
- Recent migrations are forward-only and idempotent.
- Tenant ownership has runtime guardrails and a tenant-owned table inventory.
- Core customer portal permissions now have startup readiness coverage.

Remaining risks:
- Some older baseline columns are nullable for backward compatibility where the domain model wants tenant ownership to be mandatory. These should be tightened only after production data profiling and backfill confirmation.
- There are two similarly named access tables: `client_user_access` and `user_client_access`. Both are currently used, but their ownership should be clarified during the planned large-file/domain decomposition.
- Soft-delete, retention, and archival behavior is inconsistent across modules. This is a broader data lifecycle design issue rather than a safe one-pass migration.
- Cross-table tenant consistency is mostly enforced in service code, not database check constraints/triggers. A later hardening pass should decide which invariants deserve database-level enforcement.

## Verification

Focused checks run during this pass:
- `npx vitest run server/tests/schema-readiness.test.ts server/tests/migrations-smoke.test.ts`
- `npm run check`

Full release verification and Railway deploy checks are tracked in the associated commit/push workflow.

## Scorecard

- Schema/migration alignment: Improved from B- to A-
- Startup drift detection: Improved from B to A-
- Tenant integrity posture: B+
- Portal access data model readiness: Improved from C+ to B+
- Data lifecycle consistency: C+

Overall: B+ after remediation. The main production/staging risk found in this pass has been fixed; the remaining items are better handled through planned refactor/data-hardening work rather than opportunistic schema churn.
