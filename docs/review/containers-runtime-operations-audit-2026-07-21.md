# Containers, Runtime, and Operational Configuration Audit - 2026-07-21

## Executive Assessment

Overall score: 7/10

Release recommendation: Approve with follow-up.

DigitalWorkday's Railway runtime posture is solid for the current pilot: the service binds to `0.0.0.0`, honors `PORT`, exposes public health/readiness endpoints, performs startup schema readiness checks, runs deployment smoke checks before start, and handles SIGTERM/SIGINT graceful shutdown. The main verified defect was the local container path: `docker-compose.yml` referenced a `Dockerfile` that did not exist, so compose-based runtime validation could not build the application container. This pass restores that path with a production-oriented, non-root Dockerfile and compose defaults that satisfy production startup validation.

Strongest aspects:

- `server/index.ts` starts listening early, exposes `/health`, `/readyz`, `/livez`, and drains jobs, HTTP, Socket.IO, and PostgreSQL on shutdown.
- `railway.toml` uses Railpack with `npm run build`, a pre-start deploy smoke check, `/health` healthcheck, and restart-on-failure policy.
- `server/config.ts`, `server/auth.ts`, and `server/lib/encryption.ts` fail or warn on missing production-critical runtime variables.

Most important risks:

- Docker image build could not be executed on this workstation because the Docker daemon was not running.
- Railway still uses Railpack rather than this Dockerfile, so Docker runtime parity is a local/portable validation path, not the production deployment mechanism.
- The app performs meaningful startup/schema work, so production rollout safety still depends on `/readyz`, deploy smoke, and SLO checks rather than `/health` alone.

## System Map

- Runtime: Node/Express server bundled by esbuild plus Vite-built React assets.
- Package manager: npm pinned in `package.json` as `npm@11.16.0`.
- Railway deployment: `railway.toml` with Railpack, `npm run build`, `node server/scripts/deploy-smoke.cjs && npm run start`, `/health` healthcheck.
- Local containers: `docker-compose.yml` with PostgreSQL 16 Alpine plus app build from `Dockerfile`.
- Persistence: PostgreSQL via Drizzle ORM and committed migrations.
- Health: `/health` returns liveness plus readiness/version body; `/readyz` validates DB readiness.
- Shutdown: `server/index.ts` handles SIGTERM/SIGINT with a 10s forced-exit guard.
- File uploads: app primarily uses S3/R2-style storage and in-memory multer paths for proxy upload routes.

Areas inspected:

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `railway.toml`
- `package.json`
- `script/build.ts`
- `server/index.ts`
- `server/config.ts`
- `server/auth.ts`
- `server/lib/encryption.ts`
- `server/scripts/deploy-smoke.cjs`
- `server/scripts/migrate.ts`
- `docs/DEPLOYMENT_RAILWAY.md`
- `docs/RAILWAY_DEPLOYMENT_GUIDE.md`
- `docs/12-OPERATIONS/SLOS_ALERTING_INCIDENT_RESPONSE.md`

## Findings

| ID | Severity | Confidence | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|----|----------|------------|----------|----------|-----------------|-------------------------|--------|------|
| CTR-001 | High | Confirmed | `docker-compose.yml`, repository root | `docker-compose.yml` referenced `dockerfile: Dockerfile`; no `Dockerfile` existed before remediation. | Local container runtime validation was broken and could not reproduce production-like app startup. | Add a production-oriented Dockerfile aligned with the existing npm/build/start contract. | S | Low |
| CTR-002 | Medium | Confirmed | `docker-compose.yml` | App container set `NODE_ENV=production` but did not provide `SESSION_SECRET` or `APP_ENCRYPTION_KEY`. | Production startup paths require session and encryption configuration; missing defaults make local compose brittle. | Add local-only compose defaults for required secrets and schema startup flags. | XS | Low |
| CTR-003 | Medium | Confirmed | `.dockerignore` | Ignore file omitted common heavy/unneeded context paths such as `.github`, `attached_assets`, `coverage`, logs, and generic `.env.*`. | Bloated or sensitive build contexts slow builds and can accidentally include local-only artifacts. | Tighten `.dockerignore` while preserving required package, source, and migration inputs. | XS | Low |
| CTR-004 | Low | Confirmed | `server/index.ts` | Graceful shutdown exists with a 10s forced exit and closes jobs, HTTP, Socket.IO, and DB pool. | This is positive operational evidence; no code change needed. | Keep shutdown path covered in future runtime tests. | N/A | N/A |
| CTR-005 | Low | Plausible | `railway.toml`, Dockerfile | Railway uses Railpack, while Dockerfile is for local/portable runtime validation. | Production and Docker images can drift unless both are checked periodically. | Treat Dockerfile as secondary runtime path unless the team explicitly switches Railway to Dockerfile deploys. | S | Moderate |

## Changes Made

- Added `Dockerfile`.
  - Uses Node `20.19` and pinned `npm@11.16.0`.
  - Builds with full dependencies in a build stage.
  - Installs production dependencies only in runtime stage.
  - Copies `dist`, `migrations`, and `deploy-smoke.cjs`.
  - Runs as the non-root `node` user.
  - Exposes port `5000`.
  - Adds a container `HEALTHCHECK` against `/health`.
  - Runs the existing deploy smoke before `npm run start`.
- Updated `docker-compose.yml`.
  - Supplies local-only defaults for `SESSION_SECRET` and valid base64 `APP_ENCRYPTION_KEY`.
  - Enables `AUTO_MIGRATE=true` and `FAIL_ON_SCHEMA_ISSUES=true` by default for compose.
  - Adds an app healthcheck.
- Updated `.dockerignore`.
  - Excludes common local, secret, artifact, and bulky paths from Docker build context.

Compatibility considerations:

- Railway behavior is unchanged because `railway.toml` still uses Railpack.
- Compose defaults are local-only and can be overridden by exported environment variables.
- No database schema, API contract, route, or permission behavior changed.

## Verification Results

- `docker compose config` - passed and rendered app/db services with expected environment and healthcheck configuration.
- `docker build -t digitalworkday-runtime-audit .` - could not run because Docker daemon was unavailable: `Cannot connect to the Docker daemon at unix:///Users/mikedickerman/.docker/run/docker.sock`.
- `git diff --check` - passed.
- `npm run test:ci` - supply-chain check, TypeScript, 656 fast server tests, 157 client tests, and production build passed.

Verification pending before deployment:

- Railway production and staging deploy/health checks after the stacked local commits can be pushed.

## Second Pass

No Critical findings were identified. The verified High finding in scope, the missing Dockerfile referenced by compose, has been remediated. The remaining risks are operational: run a real Docker build when Docker Desktop/daemon is available, and decide later whether Docker should become the production deployment strategy instead of Railway Railpack.

## Residual Risk and Roadmap

Immediate:

- Start Docker Desktop or the Docker daemon and run `docker build -t digitalworkday-runtime-audit .`.
- Run `docker compose up --build` against the local compose stack and verify `/health` and `/readyz`.
- Push the stacked local commits after GitHub auth has `workflow` scope.

Near term:

- Add Docker build validation to CI if Docker becomes a supported release artifact.
- Add a short compose runbook for local production-like startup.
- Periodically compare Railway Railpack runtime assumptions with Dockerfile assumptions.

Long term:

- Switch Railway from Railpack to Dockerfile only if the team wants one exact container artifact across environments.
- Add image scanning and signed provenance if Docker images become release artifacts.
- Add resource tuning after real production memory/CPU metrics justify explicit limits.

Premature:

- Do not switch production to Dockerfile solely because a Dockerfile now exists.
- Do not add container orchestration complexity while Railway Railpack is meeting deployment needs.
- Do not hard-code CPU/memory limits in repository config until Railway metrics indicate a need.

## Final Scorecard

- Container build definition: 7/10. Dockerfile now exists, but image build could not be executed locally.
- Runtime startup: 8/10. Health endpoints, deploy smoke, schema readiness, and early bind are present.
- Graceful shutdown: 8/10. SIGTERM/SIGINT drain major resources with timeout.
- Environment validation: 8/10. Critical production env vars are validated; docs still have some older naming drift.
- Health/readiness: 8/10. Good endpoint coverage; `/health` intentionally stays 200 for platform liveness.
- Build context hygiene: 7/10. `.dockerignore` improved; context should be measured during a real build.
- Production parity: 6/10. Railway uses Railpack, Docker is secondary unless explicitly adopted.
- Overall runtime operations: 7/10. Pilot-ready with Docker validation pending.
