# Test Reliability, Determinism, and Flakiness Audit - 2026-07-21

## Executive Assessment

Overall score: 8.0/10.

Release recommendation: Approve with follow-up.

The test suite is healthier than the last pass suggested: Vitest is already configured for sequential file execution, suite shuffle is disabled, DB-backed tests are isolated into a separate lane, and no committed `.only`, `.skip`, or concurrent test declarations were found. The main flake risks are concentrated in fixture uniqueness, tests that mutate global process state, and DB/live-server tests that require external runtime prerequisites.

Three strongest aspects:

- `vitest.config.ts` sets `fileParallelism: false` and `sequence.shuffle: false`, reducing cross-file shared-state and database-order flakes.
- `script/run-vitest-suite.mjs` partitions fast, HTTP, and DB-backed test lanes, and DB tests fail fast when `DATABASE_URL` is absent.
- Critical permission and tenant flows have direct tests, including route policy, tenant scope, client portal access, division scoping, comments, notifications, and auth/session behavior.

Three most important risks:

- Several tests still mutate `process.env` directly, so future attempts to re-enable parallel test files would be risky without a scoped env helper.
- DB-backed tests depend on a reachable Postgres and do not run in the default CI-style gate.
- Browser-level flows still do not have an E2E gate, so invite acceptance, portal login, dashboard rendering, and client-visible comment behavior can regress across real sessions.

## System Map

| Area | Evidence | Reliability notes |
| --- | --- | --- |
| Runtime and package manager | `package.json` uses Node/TypeScript, Express, React, Vite, Drizzle, Postgres, Socket.IO, npm 11. | Single app repo with server, client, shared schema, scripts, and Railway deployment. |
| Test runner | `vitest.config.ts`, `script/run-vitest-suite.mjs` | Node test environment, setup file, 30s timeout, sequential file execution, deterministic file order, suite classifier. |
| Server fast lane | `npm test` via `node script/run-vitest-suite.mjs fast` | 68 files after this change; no DB requirement. |
| Server HTTP lane | `npm run test:http` | 19 files and 247 tests; supertest router coverage without DB. |
| DB-backed lane | `npm run test:db` | 47 files; requires `DATABASE_URL`; includes live-localhost and direct DB integration tests. |
| Client lane | `npm run test:client` | 25 files and 157 tests in latest CI run; includes colocated client tests. |
| Deployment | Railway production and staging | Previous commits deploy automatically from `main`; health endpoint reports commit version. |

## Findings

| ID | Severity | Confidence | Exact location | Evidence | Why it matters | Recommended remediation | Effort | Risk | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRF-01 | Medium | Confirmed | `server/tests/fixtures.ts` | Shared helpers used `Date.now()` for default user emails and tenant slugs. | Multiple fixture records created in the same millisecond can collide on unique email/slug constraints, especially on fast machines or retried DB suites. | Add a monotonic `uniqueTestId` helper and use it for shared fixture defaults. | XS | Low | `npx vitest run server/tests/helpers/uniqueTestId.test.ts server/tests/typing.test.ts`; `npm test`. |
| TRF-02 | Low | Confirmed | `server/tests/typing.test.ts` | The TTL expiration test used `vi.spyOn(Date, "now")` and restored inside the test body. | If an assertion failed before restore, the Date spy could leak into later tests in the same file. | Move spy cleanup to `afterEach`. | XS | Low | `npx vitest run server/tests/helpers/uniqueTestId.test.ts server/tests/typing.test.ts`. |
| TRF-03 | Medium | Strongly Supported | `server/tests/*`, `server/__tests__/*` | Many tests mutate `process.env` directly, including `NODE_ENV`, `TENANCY_ENFORCEMENT`, `CHAT_DEBUG`, purge/debug flags, and Stripe secrets. | Current sequential execution controls most risk, but env mutation remains a blocker to future parallelism and can leak when test cleanup misses a failure path. | Introduce a scoped env helper, then replace direct env mutation opportunistically when touching those tests. Do not mass-rewrite all tests at once. | M | Moderate | Add helper-level tests; rerun fast and HTTP suites; run DB lane with test Postgres. |
| TRF-04 | Medium | Confirmed | `server/tests/server-integration.test.ts`, `server/tests/integration/*Routes.test.ts`, `script/run-vitest-suite.mjs` | Live-server tests call `request("http://localhost:5000")` or `request(BASE)` and are classified into the DB lane. | These tests are valid integration checks but will fail when the local server and database are not provisioned. | Keep out of fast/HTTP gates; document exact prerequisites; add a Railway/local smoke workflow if they should block releases. | S | Low | `npm run test:db` with `DATABASE_URL` and a started app. |
| TRF-05 | Medium | Confirmed | Repo-wide test tooling | No Playwright/Cypress config or E2E gate was found. | Unit/API tests cannot prove browser session, invite acceptance, portal dashboard, and permission rendering flows end-to-end. | Add a tiny deterministic Playwright smoke suite for critical portal/admin flows before expanding. | M | Moderate | `npx playwright test` once configured. |
| TRF-06 | Low | Confirmed | `docs/TESTING.md`, `docs/testing.md` | Git tracks both case variants; macOS exposes one physical file. | Case-collided docs can show phantom local diffs and make documentation changes harder to stage cleanly. | Keep both blobs synced when docs change; schedule a controlled repository cleanup on a case-sensitive environment. | S | Moderate | `git ls-files -s docs/TESTING.md docs/testing.md`; clean `git status`. |

## Changes Made

| File | Change | Why |
| --- | --- | --- |
| `server/tests/helpers/uniqueTestId.ts` | Added monotonic test ID helper using timestamp, process ID, and sequence number. | Prevent same-millisecond fixture collisions while keeping IDs readable. |
| `server/tests/helpers/uniqueTestId.test.ts` | Added regression coverage for same-millisecond uniqueness. | Proves the helper addresses the exact flake mode. |
| `server/tests/fixtures.ts` | Replaced shared fixture default emails/slugs with `uniqueTestId`. | Reduces DB unique-constraint flakes across every test using shared factories. |
| `server/tests/typing.test.ts` | Restores Date spies in `afterEach`. | Prevents mocked time from leaking after an assertion failure. |
| `docs/testing.md` | Updated fast suite count to 68 files. | Keeps the testing guide aligned with the runner output. |

Compatibility considerations:

- No production runtime behavior changed.
- Fixture IDs remain human-readable and are only used by tests.
- Test execution remains sequential; no CI runtime concurrency assumptions changed.
- Railway deployment should be treated as a normal release verification step even for test-only commits so production and staging stay aligned.

## Verification Results

| Command | Status | Important output |
| --- | --- | --- |
| `npx vitest run server/tests/helpers/uniqueTestId.test.ts server/tests/typing.test.ts` | Passed | 2 files, 12 tests. |
| `node script/run-vitest-suite.mjs fast --list` | Passed | 68 fast, 19 HTTP, 47 DB-backed, 134 total server test files. |
| `rg '.only\(|.skip\(|describe.concurrent|it.concurrent|test.concurrent' ...` | Passed | No committed focused/skipped/concurrent tests found. |
| `git diff --check` | Passed | No whitespace/errors in patch. |
| `npm run test:http` | Passed | 19 files, 247 tests. |
| `npm run test:ci` | Passed | Supply-chain check, TypeScript, 68 fast server files and 649 tests, 25 client files and 157 tests, production build. |

## Residual Risk and Roadmap

Immediate:

1. Keep the current sequential file execution. Do not re-enable parallel test files until env mutation is isolated.
2. Run `npm run test:db` only with an explicit test Postgres database and started local app for live-server files.
3. Continue adding cleanup in `afterEach` for fake timers and spies when touching tests.

Near-term:

1. Add `withEnv` or `setTestEnv` helper coverage and migrate direct env mutation in high-churn tests: `tenantScope`, `errors`, `standard-error-codes`, `chatDebugRoutes`, `purge-guards`, `stripe_webhook_hardening`, and upload guard tests.
2. Add a DB test bootstrap script that validates `DATABASE_URL` points to a non-production database before allowing destructive cleanup.
3. Add a deterministic Playwright smoke suite for invite acceptance, client collaborator login, portal dashboard, project/task visibility, and comment visibility.

Long-term:

1. Split Vitest projects by server-fast, server-http, server-db, and client so each lane can use the narrowest setup and environment.
2. Add flake telemetry in CI: rerun failed tests once, persist first-failure logs, and report repeat offenders rather than hiding them.
3. Resolve the `docs/TESTING.md` and `docs/testing.md` case collision in a planned repository hygiene pass.

Do not pursue yet:

- Do not add blanket retries to Vitest. That hides deterministic failures and makes root-cause analysis worse.
- Do not parallelize DB-backed tests until fixtures, cleanup, and tenant/database isolation are intentionally designed for it.
- Do not add a broad random-order gate before env mutation is scoped; it would be noisy without being actionable.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | --- | --- |
| Deterministic execution order | 9 | Sequential files and shuffle disabled; individual tests can still mutate globals. |
| Fixture uniqueness | 8 | Shared fixtures fixed; direct test-local `Date.now()` IDs remain. |
| Cleanup discipline | 7 | Strong DB cleanup helpers exist; env and spy cleanup are uneven. |
| External dependency isolation | 7 | DB/live-server tests are partitioned, but DB lane still needs explicit external setup. |
| Fast feedback reliability | 9 | Fast and HTTP lanes are clean and no-DB. |
| CI release confidence | 8 | `test:ci` is strong for type/build/fast/client; DB and browser gates remain outside default CI. |
| Browser workflow coverage | 5 | No E2E gate found for real portal/admin flows. |
