# Test Strategy and Coverage Quality Audit - 2026-07-21

## Verdict

Overall score: 8.1/10.

DigitalWorkday has a materially useful regression suite for the highest-risk areas of the product: multi-tenancy, route policy, auth/session behavior, customer portal access, task/project/client CRUD, notifications, file serving, rate limits, and error envelopes. The main weakness was not lack of tests; it was suite topology drift. Some tests were invisible to the default runner, client colocated tests were skipped by the npm script, and DB-backed route tests were sitting in the no-DB HTTP lane.

## System Map

| Layer | Current coverage | Assessment |
| --- | --- | --- |
| Server fast unit/policy suite | 67 files | Strong for deterministic policy, auth, helpers, storage-independent route behavior, and tenant invariants. |
| Server HTTP route suite | 19 files, 247 tests | Now DB-free and green locally; covers supertest-mounted route behavior without requiring Postgres. |
| Server DB-backed suite | 47 files | Broad integration coverage for CRUD, tenant provisioning, portal permissions, division cascade, time tracking, bootstrap, purge, and super-admin paths. Requires `DATABASE_URL`. |
| Client unit/render suite | 25+ files | Useful coverage for UI utilities, portal dashboard, design tokens, permissions UI, auth routing, notifications, and selected components. |
| E2E/browser suite | Not found | No Playwright/Cypress gate found for invite acceptance, login, portal dashboard, comment visibility, or tenant admin flows. |
| Visual/accessibility/performance gates | Limited | Static/component-level a11y improvements exist, but no screenshot/visual regression or performance-budget gate is enforced. |

## Findings

| ID | Severity | Status | Area | Evidence | Risk | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| TSQ-01 | Medium | Fixed | Server test discovery | `script/run-vitest-suite.mjs` only scanned `server/tests`, while `server/__tests__/tenantScope.test.ts` existed and was not in the server include list. | Tenant scoping regressions could be missed by the default server gate. | Runner now scans `server/tests` and `server/__tests__`; Vitest include now includes `server/__tests__/**/*.test.ts`. |
| TSQ-02 | Medium | Fixed | Client test discovery | `npm run test:client` only targeted `client/src/__tests__`, while colocated tests such as `client/src/components/richtext/mentionUtils.test.ts` exist. | Component/helper regressions could be skipped in CI. | `test:client` now runs all `client/src/**/*.test.ts` and `client/src/**/*.test.tsx` files. |
| TSQ-03 | Medium | Fixed | Suite partitioning | `npm run test:http` mixed DB-backed route tests into the no-DB lane and failed without `DATABASE_URL`. | Developers could not trust a local HTTP smoke failure as a real app regression. | Added DB fixture/live-server detection, explicit `@suite` overrides, and a clear `DATABASE_URL` prerequisite for `test:db`. |
| TSQ-04 | Medium | Fixed | Regression intent | `server/tests/client-delete-authorization.test.ts` expected super users to delete tenant-scoped clients without selecting an effective tenant. | Test contradicted the current explicit-tenant authorization model. | Updated the test to assert `TENANT_REQUIRED`, matching the hardened tenant policy. |
| TSQ-05 | Low | Fixed | Invite test determinism | Portal invite tests asserted `https://app.test` links while the helper falls back to localhost unless `APP_PUBLIC_URL` or `APP_URL` is configured. | Invite URL tests could fail because of missing test env, not product behavior. | Test setup now sets `APP_PUBLIC_URL=https://app.test`. |
| TSQ-06 | Medium | Open | E2E critical workflows | No Playwright/Cypress gate was found. | Invite acceptance, client login, portal dashboard, permissions, and client-visible comments can regress across browser/session boundaries. | Add a small critical-path Playwright suite before broader refactors. |
| TSQ-07 | Low | Open | Coverage thresholds | No enforced targeted coverage threshold was found. | Coverage can decline in critical modules without a loud signal. | Add targeted thresholds for portal permissions, auth/session, comments visibility, and notification read-state modules after E2E smoke is stable. |

## Changes Applied

- Expanded server test discovery to include legacy colocated server tests.
- Added explicit suite markers for DB-backed route integration tests.
- Made `test:http` a genuinely DB-free supertest lane.
- Added a fail-fast message for `test:db` when `DATABASE_URL` is missing.
- Expanded `test:client` to include colocated client test files.
- Fixed stale client-delete authorization and portal invite URL test expectations.
- Updated `docs/testing.md` with current suite topology and counts.

## Verification

Completed locally:

| Command | Result |
| --- | --- |
| `node script/run-vitest-suite.mjs http --list` | 67 fast, 19 HTTP, 47 DB-backed, 133 total server test files |
| `npm run test:http` | Passed, 19 files and 247 tests |
| `npx vitest run server/__tests__/tenantScope.test.ts` | Passed, 8 tests |
| `npm run test:ci` | Passed: supply-chain check, TypeScript, 67 fast server files and 648 tests, 25 client files and 157 tests, production build |

## Recommended Roadmap

1. Add a small Playwright critical-path gate: internal login, create portal invite link, accept invite, client login, portal dashboard, project/task visibility, comment visibility.
2. Add one DB-backed portal permission fixture that covers parent client plus child division access and denied sibling access.
3. Add mutation regression tests for notification clear/read behavior, comment mention visibility, and portal collaborator actions.
4. Add targeted coverage thresholds only after the critical modules have stable boundaries.
5. Keep DB-heavy tests out of the fast and HTTP gates unless they use full mocks.

## Scorecard

| Category | Score | Notes |
| --- | --- | --- |
| Critical workflow coverage | 8 | Strong API/policy coverage; browser E2E is the main gap. |
| Tenant/data isolation coverage | 9 | Broad multi-tenant and permission tests, including portal access paths. |
| Suite reliability | 8 | Improved by this change; DB lane still depends on external Postgres. |
| Frontend coverage | 7 | Colocated tests now included; broad interaction coverage remains limited. |
| CI confidence | 8 | Fast/client/build gate is solid; add E2E and targeted coverage thresholds next. |
