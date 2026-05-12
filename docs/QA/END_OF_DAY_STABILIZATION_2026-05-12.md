# End Of Day Stabilization - 2026-05-12

## Scope

End-of-day cleanup and QA pass for the Staging V2 client portal access build-out.

## Completed

- Tightened the portal access model to two active customer-facing roles: Customer Portal Admin and Contributor.
- Kept legacy `viewer` records functional as contributor-equivalent access.
- Limited portal user management controls to Customer Portal Admins while still letting Contributors view the user list.
- Added portal task API coverage for visible task edits, comments, and subtasks with tenant/client scoping.
- Preserved the task comment privacy rule: portal users see their own comments and comments where they are explicitly mentioned.
- Updated Super Admin documentation for portal behavior, QA, permissions, and API notes.

## Automated QA Results

| Command | Result | Details |
|---------|--------|---------|
| `npm run check` | Passed | TypeScript completed with no errors |
| `npm test` | Passed | 51 test files, 596 tests |
| `npm run build` | Passed | Production client/server build completed |
| `npm run test:http` | Blocked locally | 15 files passed, 13 failed; most failures trace to Postgres connection refusal |
| `npm run test:db` | Blocked locally | DB-backed tests could not connect to local Postgres on `localhost:5432` |
| `npm run test:all` | Blocked locally | 86 files passed, 49 failed; 1,129 tests passed, 214 failed, 291 skipped |

## Environment Blockers

- Local Postgres was not running or reachable at `localhost:5432`, so DB-backed integration tests returned storage-layer 500s instead of the expected route assertions.
- Some integration smoke tests still expect 401 for unauthenticated routes that currently return 403. This appears broader than the client portal work and should be reviewed separately.

## Build Warnings To Track

- Browserslist data is stale and should be refreshed in a dedicated dependency-maintenance pass.
- A few Tailwind `data-[state=...]` arbitrary duration classes are ambiguous.
- Several production chunks exceed the default 500 kB warning threshold.

## Recommended Tomorrow Start

1. Run the DB and HTTP suites against a staging-like database with `DATABASE_URL` configured.
2. Complete manual staging QA for portal login, overview, contacts, projects/tasks, portal users, messages, support, service requests, approvals, and assets.
3. Decide whether the 401-vs-403 route expectation mismatch is desired behavior or test drift.
