# Developer Experience, Documentation, and Maintainership Audit

Date: 2026-07-21
Branch: `main`

## Executive Assessment

Overall score: 7/10
Release recommendation: Approve with follow-up

Digital Workday has a stronger developer foundation than the README initially suggested: package scripts cover typecheck, fast tests, client tests, supply-chain checks, production readiness, SLO checks, publishing boundaries, and production builds. The main problem in this pass was not missing tooling; it was stale entrypoint documentation. New developers would hit outdated Node/npm guidance, older storage variable names, and several broken docs hub links before they reached the current numbered documentation tree.

Strongest aspects:

- `package.json` exposes practical local and release gates: `check`, `test`, `test:http`, `test:db`, `test:ci`, `production:check`, `slo:check`, `publishing:check`, and `supply-chain:check`.
- `server/config.ts` centralizes runtime configuration and fails fast in production for missing core variables.
- Documentation breadth is high: numbered docs, API registry, functional docs, operations runbooks, Railway checklists, and recent audit reports are present.

Most important risks:

- Entry-level docs had stale names and setup instructions, which increases onboarding time and operator mistakes.
- The docs tree contains both legacy root-level docs and newer numbered sections, so contributors need clearer entrypoints.
- Full DB-backed verification still depends on a configured local/test `DATABASE_URL`.

## System Map

Application type: multi-tenant authenticated SaaS.
Runtime and package manager: Node.js 20-compatible app pinned to `npm@11.16.0`.
Frontend: React 18, Vite 7, TypeScript, Tailwind, shadcn-style primitives, TanStack Query.
Backend: Express 4, TypeScript, Drizzle ORM, PostgreSQL, Socket.IO.
Deployment: Railway-oriented Node service with production build, deploy smoke checks, health/readiness endpoints, and Railway checklist docs.
Testing: Vitest fast suite, client Vitest suite, HTTP suite, DB suite, TypeScript check, production build, supply-chain check.

Areas inspected: root README, docs README, getting-started/development/testing docs, environment examples/reference, package scripts, server config, deploy smoke checks, Railway docs, API registry, and recent review reports.

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DX-001 | Medium | Confirmed | `docs/README.md` | Broken links to `./architecture/DATABASE_SCHEMA.md`, `./integrations/MAILGUN.md`, `./performance/INDEXING_STRATEGY.md`, `./admin/SYSTEM_HEALTH.md`, `./dev/QUICK_START.md`, `./dev/ADDING_FEATURES.md`, and `./deployment/ENVIRONMENT_SETUP.md`. | The docs hub is a new-developer entrypoint; broken links make the repo feel unmaintained and slow down setup. | Repointed links to existing docs and added `npm run docs:check`. | S | Low |
| DX-002 | Medium | Confirmed | `README.md` | README listed Node.js 18+, npm/yarn, `npx drizzle-kit push`, S3 variables, and old MyWorkDay naming. Current repo pins `npm@11.16.0`, has a guarded `db:push`, and uses Cloudflare R2 config names. | Incorrect setup instructions can lead to local drift or unsafe schema operations. | Updated README quick start, scripts, storage env names, and deployment/test guidance. | S | Low |
| DX-003 | Low | Confirmed | `.env.example`, `server/scripts/deploy-smoke.cjs` | Deploy smoke requires `APP_ENCRYPTION_KEY`; `.env.example` left it commented and omitted `SESSION_SECRET`. | Developers copying the example had to discover missing required variables later. | Added explicit local example values and R2 variable names. | XS | Low |
| DX-004 | Informational | Confirmed | `package.json`, `.github/workflows/ci.yml` | `test:ci` chains supply-chain check, typecheck, server tests, client tests, and build; GitHub workflow runs `npm ci` and `npm run test:ci`. | Release verification is solid and should remain the default before deploy. | No runtime change needed. | XS | Low |

## Changes Made

- Updated `README.md` for current branding, Node/npm prerequisites, database commands, script list, R2 environment variables, docs process, and Railway/Postgres backup language.
- Updated `docs/README.md` to remove broken entrypoint links and align the docs hub with existing files.
- Updated `.env.example` to include `SESSION_SECRET`, a valid 32-byte base64 local `APP_ENCRYPTION_KEY`, and Cloudflare R2 variable names.
- Added `script/docs-entrypoint-check.cjs` and `server/tests/docs-entrypoint-check.test.ts`.
- Added `docs:check` to `package.json`.

Compatibility: no runtime behavior, API contracts, database schema, auth behavior, or deployment configuration changed.

## Verification Results

Commands run:

- `npm run docs:check`
- `npx vitest run server/tests/docs-entrypoint-check.test.ts`
- `npm run production:check`
- `npm run test:ci`

## Residual Risk And Roadmap

Immediate:

- Run `npm run docs:check` whenever editing `README.md` or `docs/README.md`.
- Keep root README focused on setup and trusted links rather than duplicating every deep doc.

Near term:

- Expand docs checking to all files after first pruning or marking legacy docs to avoid a noisy migration.
- Add a short `CONTRIBUTING.md` that points to branch, test, docs, and deploy expectations.
- Add ownership labels for high-risk areas: auth/tenant context, client portal permissions, migrations, document storage, and Railway operations.

Long term:

- Consolidate legacy root-level docs into the numbered docs tree or clearly label historical baselines.
- Generate a docs inventory from the super-admin docs scanner and compare it against committed markdown links.

Do not pursue now:

- Do not rewrite the entire docs tree while production portal work is active.
- Do not require DB-backed tests in the default fast local loop; keep them explicit because they need a configured test database.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Onboarding | 7 | Entrypoints are now accurate, but broader docs consolidation remains. |
| Local setup | 8 | Commands and env example now match current app; local Postgres is still required. |
| Scripts and gates | 9 | Strong release scripts and CI path exist. |
| Environment clarity | 8 | Core envs are documented; optional integrations remain broad. |
| Architecture docs | 7 | Many docs exist, but legacy and numbered docs overlap. |
| API docs | 8 | API registry exists and can be synced through super-admin docs tooling. |
| Test ergonomics | 8 | Fast/client/release suites are easy to run; DB suite needs explicit setup. |
| Maintainership | 7 | Added entrypoint link checking; full-doc link governance is future work. |
