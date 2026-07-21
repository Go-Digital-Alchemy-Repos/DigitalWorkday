# Production Readiness and Launch Approval Review - 2026-07-21

## Executive Assessment

Overall score: 8/10.

Release recommendation: Approve with follow-up once the two local release-gate commits and this review commit are pushed to GitHub and Railway has deployed them to both production and staging.

Strongest aspects:
- Railway config now runs `server/scripts/deploy-smoke.cjs` before `npm run start`, exposes `/health`, and has restart policy configured in `railway.toml`.
- CI has a single `npm run test:ci` gate, generates a CycloneDX SBOM, and uploads release artifacts in `.github/workflows/ci.yml`.
- Production schema changes are migration-led: `package.json` runs `server/scripts/migrate.ts` for `db:migrate`, while `db:push` is guarded by `server/scripts/guard-production-push.ts`.

Most important risks:
- Deployment is not fully complete from this workstation because GitHub rejected the push that creates `.github/workflows/ci.yml`; the active token needs `workflow` scope before Railway can pick up the queued commits.
- Railway runtime variables still need live-environment verification for production and staging, especially `DATABASE_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `AUTO_MIGRATE`, and `FAIL_ON_SCHEMA_ISSUES`.
- Database backups and restore drills are documented, but this repository does not contain evidence of a recent restore test against a staging database.

## System Map

DigitalWorkday is a Node/Express and React/Vite application using npm `11.16.0`, TypeScript `5.6.3`, Drizzle/PostgreSQL migrations, session auth through Express/Passport, TanStack Query on the frontend, and Railway deployment through `railway.toml`. The production execution path is:

1. Railway builds with `npm run build`.
2. Railway starts `node server/scripts/deploy-smoke.cjs && npm run start`.
3. `deploy-smoke.cjs` verifies required secrets and build artifacts.
4. `npm run start` serves `dist/index.cjs`, exposes `/health`, and uses PostgreSQL through `DATABASE_URL`.

Areas inspected: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `railway.toml`, `deploy/Dockerfile.reference`, `docker-compose.yml`, `server/scripts/deploy-smoke.cjs`, migration scripts, SLO smoke checks, rollback/incident docs, Railway deployment docs, environment docs, and prior review artifacts in `docs/review`.

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-001 | High | Confirmed | `server/scripts/deploy-smoke.cjs` | Required env vars included `DATABASE_URL` and `SESSION_SECRET`, but not `APP_ENCRYPTION_KEY`; runtime encryption code in `server/lib/encryption.ts` requires `APP_ENCRYPTION_KEY` in production. | A deploy could pass smoke checks and later fail when encrypted tenant/integration settings are used. | Added `APP_ENCRYPTION_KEY` as required and validate it decodes to 32 bytes. | XS | Low |
| PRD-002 | High | Confirmed | `.github/workflows/ci.yml` and GitHub push result | Local CI workflow exists, but `git push origin main` failed because token lacks `workflow` scope. | Railway cannot deploy local release-gate changes until GitHub accepts the workflow file. | Refresh GitHub auth with `workflow` scope, then push the queued commits. | XS | Low |
| PRD-003 | Medium | Strongly Supported | Railway environments | Repo defines required env vars in docs/config, but live production/staging variables are not encoded in the repository. | Production and staging parity depends on external Railway settings. | Run `npm run production:check`, `npm run slo:check` per environment, and Railway variable verification before each launch. | S | Low |
| PRD-004 | Medium | Strongly Supported | `docs/ROLLBACK_PROCEDURE.md`, `docs/12-OPERATIONS/SLOS_ALERTING_INCIDENT_RESPONSE.md` | Rollback and incident playbooks exist, but no dated restore-drill artifact was found. | Backups are only launch-grade when restore has been exercised. | Schedule and record a staging restore drill before inviting additional clients. | M | Low |

## Changes Made

- Updated `server/scripts/deploy-smoke.cjs` to require `APP_ENCRYPTION_KEY` and validate it is a base64-encoded 32-byte key.
- Added `server/scripts/production-readiness-check.cjs`, a deterministic repo-level launch gate for CI, Railway, scripts, smoke checks, container runtime, and operational docs.
- Added `server/tests/production-readiness-check.test.ts` to keep the readiness gate covered.
- Added this production-readiness review document.

Compatibility considerations: the deploy smoke check is intentionally stricter in production. Existing Railway services must set `APP_ENCRYPTION_KEY` before this reaches production or startup should fail fast.

## Verification Results

Commands run:
- `node server/scripts/production-readiness-check.cjs`
- `npx vitest run server/tests/production-readiness-check.test.ts`
- `npm run test:ci`

Remaining external verification:
- `git push origin main` after refreshing GitHub auth with `workflow` scope.
- Confirm Railway production and staging deploys reach green health.
- Run SLO probes with `SLO_BASE_URL=<environment-url> npm run slo:check` for both production and staging.
- Run a staging database restore drill and record the result.

## Residual Risk And Roadmap

Immediate:
- Refresh GitHub CLI auth with `workflow` scope and push the three queued commits.
- Confirm Railway production and staging variables include `APP_ENCRYPTION_KEY`, `SESSION_SECRET`, `AUTO_MIGRATE=true`, and `FAIL_ON_SCHEMA_ISSUES=true`.
- Run `npm run production:check` and environment SLO probes before client portal invites.

Near term:
- Add a documented restore-drill record with date, backup source, restore target, duration, and validation queries.
- Add a staging post-deploy checklist that logs the exact commit SHA, Railway deployment URL, and SLO result.

Long term:
- Add automated external synthetic checks for login, dashboard load, portal projects, portal tasks, notifications, and comments visibility.
- Add release notes/change-risk templates once the portal workflow stabilizes.

Do not pursue a large release-management platform yet; the current project needs a small repeatable gate and verified Railway parity first.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Release automation | 8 | CI is present locally, but push is blocked by token scope. |
| Environment parity | 7 | Config is explicit; live Railway variable verification still required. |
| Secrets readiness | 8 | `APP_ENCRYPTION_KEY` is now smoke-checked; live values need confirmation. |
| Migration safety | 8 | Migrations are favored and direct push is guarded. |
| Health and observability | 8 | `/health`, `/readyz`, SLO checks, and incident docs exist; synthetic portal checks remain future work. |
| Rollback and recovery | 7 | Rollback docs exist; restore drill evidence is missing. |
| Test confidence | 8 | `test:ci` is broad; DB-backed environment tests still require provisioned database context. |
| Operability | 8 | Smoke, SLO, CI, and docs now form a clear launch gate. |
