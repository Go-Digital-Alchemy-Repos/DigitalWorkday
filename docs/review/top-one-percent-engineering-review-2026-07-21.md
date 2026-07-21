# Top 1% Engineering Excellence Review

Date: 2026-07-21
Branch: `main`

## Executive Assessment

Overall score: 8/10
Release recommendation: Approve with follow-up once the queued commits are pushed, deployed to staging, and SLO-checked.

Digital Workday is now in a credible production-pilot posture. The codebase has an authenticated multi-tenant SaaS architecture, explicit route-policy metadata, tenant-isolation tests, deploy smoke checks, production readiness gates, supply-chain checks, crawler/publishing boundaries, AI governance, documentation entrypoint checks, repository governance, and operational runbooks. The biggest remaining problem is outside the application code: the local release stack cannot currently reach GitHub/Railway because GitHub rejects workflow updates from the current OAuth token without `workflow` scope.

Three strongest aspects:

- Multi-tenant and route-policy guardrails are real, not aspirational: route registry/policy tests, tenant context docs, auth/session controls, and portal permission work exist.
- Release discipline is now explicit: `test:ci`, `production:check`, `publishing:check`, `docs:check`, `governance:check`, and the new `release:check` command.
- Operational posture is appropriate for a production pilot: Railway checklists, deploy smoke, health/readiness endpoints, SLO probe, rollback docs, incident record, and governance docs are present.

Three most important risks:

- The GitHub token lacks `workflow` scope, so local commits containing `.github/workflows/ci.yml` remain unpushed and Railway cannot deploy them.
- Customer portal flows still need browser-level end-to-end validation with real sessions, seeded portal users, division access, and client-visible comment rules.
- Live staging/production parity and backup restore confidence remain external-state tasks requiring Railway verification, SLO probes, and a recorded restore drill.

## System Map

Runtime: Node.js 20, npm 11.16.0, Express 4, React 18, Vite 7, TypeScript 5.6, Drizzle ORM, PostgreSQL, Socket.IO, Cloudflare R2-compatible storage, Railway deployment.

Primary execution paths:

- Auth/session/invites/password reset/Google OAuth in `server/auth.ts`.
- API domain routing through `server/http/mount.ts`, `server/http/routerFactory.ts`, and route-policy metadata.
- Tenant isolation through `server/middleware/tenantContext.ts`, policy middleware, Drizzle tenant filters, and tenant-owned schema patterns.
- Client portal through `server/features/client-portal/*`, `server/features/clients/*`, and `client/src/pages/client-portal-*`.
- Release flow through `package.json`, `.github/workflows/ci.yml`, `railway.toml`, `server/scripts/deploy-smoke.cjs`, production/static/slo/governance checks.

Generated/vendor files and files not changed casually: `node_modules/`, `dist/`, `package-lock.json`, `migrations/meta/*_snapshot.json`, generated API registry sections below `<!-- === AUTO-GENERATED SECTION`.

## Top 10 Risks

| Rank | Risk | Evidence | Next action |
| ---: | --- | --- | --- |
| 1 | Push/deploy blocked by GitHub workflow scope | `git push origin main` rejects `.github/workflows/ci.yml` without `workflow` scope | Refresh GitHub auth with `workflow` scope and push the 10+ queued commits |
| 2 | Portal browser journeys lack an E2E release gate | Prior test reliability review notes no browser-level gate for invite acceptance, portal login, dashboard, comments | Add Playwright smoke for portal invite/login/dashboard/comment visibility |
| 3 | Staging/prod parity is not yet re-verified after queued local work | Local `main` ahead of `origin/main`; Railway cannot deploy until push succeeds | Deploy to staging, run `SLO_BASE_URL=<staging> npm run slo:check`, then production |
| 4 | Backup restore confidence is not proven by a recent artifact | Production readiness review calls for a staging restore drill | Perform and record a staging restore drill |
| 5 | CODEOWNERS cannot be automated yet | Governance doc states no stable GitHub teams/handles are known | Define GitHub teams/users and add `.github/CODEOWNERS` |
| 6 | CI does not yet run all new static gates | Workflow currently runs `npm run test:ci`; newer gates are local scripts | After workflow-scope fix, update CI to run `npm run release:check` |
| 7 | Some docs remain legacy/overlapping | Docs tree has numbered sections plus many root legacy docs | Consolidate or label legacy docs after portal stabilization |
| 8 | DB-heavy tests require explicit environment | `test:db` requires a configured non-production `DATABASE_URL` | Add a DB test bootstrap guard and staging fixture plan |
| 9 | Live performance risks need measurement | Query review deferred aggregate/search optimizations pending production data | Capture query stats and EXPLAIN plans on representative staging data |
| 10 | Bundle warnings remain | Build reports large chunks, stale Browserslist, Tailwind/PostCSS warnings | Address after portal correctness and deployment are stable |

## Top 10 Improvements

| Rank | Improvement | ROI | Owner area |
| ---: | --- | --- | --- |
| 1 | Refresh GitHub auth with `workflow` scope and push queued commits | Critical | Release/CI |
| 2 | Add `release:check` as the one-command predeploy gate | High | Release/CI |
| 3 | Run staging deploy plus SLO/version verification | High | Railway operations |
| 4 | Add portal E2E smoke covering invite, login, dashboard, projects/tasks, comment visibility | High | Client portal |
| 5 | Record a staging backup restore drill | High | Data/operations |
| 6 | Add CODEOWNERS after GitHub handles are known | Medium | Governance |
| 7 | Add CI execution of `npm run release:check` | Medium | CI |
| 8 | Add read-only query-plan capture script for staging | Medium | Database performance |
| 9 | Consolidate docs tree and mark historical docs | Medium | Developer experience |
| 10 | Continue large-file decomposition only around active bugs/features | Medium | Maintainability |

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1-001 | High | Confirmed | GitHub push result | Push rejected because OAuth token lacks `workflow` scope for `.github/workflows/ci.yml`. | Production/staging cannot receive the tested local release stack. | Refresh GitHub auth with workflow scope, then push. | XS | Low |
| T1-002 | Medium | Confirmed | `package.json` | Individual gates existed, but no single aggregate release command. | Operators need one predeploy command that exercises docs, governance, publishing, production, and CI gates. | Added `release:check`. | XS | Low |
| T1-003 | Medium | Strongly Supported | `docs/12-OPERATIONS/README.md` | Operations README linked to non-existent `MONITORING.md`, `BACKUPS.md`, `DISASTER_RECOVERY.md`, `SCALING.md`, and `MAINTENANCE.md`. | Operators could follow stale links during release/incident work. | Updated operations README to real docs and release gate guidance. | XS | Low |
| T1-004 | Medium | Strongly Supported | Client portal test surface | Prior reviews identify lack of browser-level portal smoke. | Portal invite/access/comment permissions are user-critical and cross auth/UI/API boundaries. | Add E2E smoke after push/deploy blocker is resolved. | M | Moderate |
| T1-005 | Low | Confirmed | `docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md` | CODEOWNERS intentionally not active yet. | Automated owner review cannot start until handles/teams exist. | Add CODEOWNERS after owner handles are defined. | S | Low |

## Changes Made

- Added `release:check` to `package.json`.
- Updated `CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md` to use the aggregate release gate.
- Updated `script/repository-governance-check.cjs` so governance enforcement covers `release:check`.
- Updated `docs/12-OPERATIONS/README.md` to point to real operational docs and current commands.
- Added this integrated capstone review.

Compatibility: no runtime behavior, API contract, database schema, auth policy, client UI, or Railway config changed.

## Verification Results

Commands run:

- `npm run governance:check`
- `npx vitest run server/tests/repository-governance-check.test.ts`
- `npm run docs:check`
- `npm run production:check`
- `npm run release:check`

Remaining gaps:

- `npm run release:check` includes the full `test:ci` path and passed locally, but DB-backed and browser E2E checks remain explicit future gates.
- Railway deployment verification remains blocked until GitHub accepts the queued workflow-containing commits.

## 30-Day Roadmap

1. Refresh GitHub auth with `workflow` scope and push the queued commits.
2. Deploy staging, run `npm run slo:check` against staging with expected commit, then repeat for production.
3. Add portal E2E smoke for invite acceptance, login, dashboard, projects/tasks, approvals/support, and client-visible comments.
4. Run and record a staging database restore drill.
5. Add real `.github/CODEOWNERS` once GitHub handles/teams are known.

## 90-Day Roadmap

1. Add `release:check` to GitHub Actions and require it through branch protection.
2. Consolidate legacy docs into the numbered docs tree or mark them historical.
3. Add staging query-plan capture for expensive report/search paths.
4. Add synthetic monitoring for portal login/dashboard and production health/version.
5. Continue file decomposition only around touched modules with tests.

## Quality Gates

Default predeploy command:

```bash
npm run release:check
```

Domain-specific gates:

- `npm run test:http` for API/middleware/auth work.
- `npm run test:db` for database behavior with non-production `DATABASE_URL`.
- `npm run publishing:check` for public routes/crawler/content-adjacent work.
- `SLO_BASE_URL=<url> npm run slo:check` after deployment.

## Ownership Model

Use `docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md` as the temporary owner map until `.github/CODEOWNERS` can be populated with real handles. Highest-risk owners by concern: auth/tenant policy, client portal permissions, schema/migrations, storage/uploads, Railway/CI, docs/governance, and AI governance.

## What Should Remain Unchanged

- Keep `main` as the production source of truth.
- Keep tenant isolation based on tenant context, not workspace visibility.
- Keep direct production schema push prohibited; use migrations.
- Keep public crawler/sitemap surfaces narrow until a real public CMS model exists.
- Keep DB-backed and browser tests explicit until their environments are reliably provisioned.
- Keep this as a production-pilot governance model; do not add heavyweight release bureaucracy yet.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Architecture | 8 | Strong modular route/policy direction; some legacy overlap remains. |
| Correctness | 8 | Broad fast/client tests pass; DB/E2E remain explicit. |
| Security | 8 | Good tenancy/auth/upload/AI guardrails; portal E2E and headers remain ROI items. |
| Performance | 7 | Static/bundle/cache work exists; live query and bundle measurement remains. |
| Reliability | 8 | Health/readiness/smoke/SLO/checks are strong for pilot scale. |
| Scalability | 7 | Pool controls and guidance exist; production capacity data still needed. |
| Accessibility | 7 | Accessibility audit exists; not yet a browser gate. |
| Testing | 8 | `test:ci` is strong; DB and E2E gates are future. |
| Observability | 8 | Request IDs, error logs, health, status, SLO checks exist. |
| Delivery | 7 | Strong local gates; push/deploy blocked by GitHub scope. |
| Developer Experience | 8 | Entrypoints and governance improved; docs consolidation remains. |
| Product Polish | 7 | Portal/dashboard improvements underway; real client smoke remains. |
| Documentation | 8 | Rich docs and entrypoint checks; legacy overlap remains. |
| AI Governance | 8 | Model/input/output guardrails exist; live usage monitoring remains. |
| Simplicity | 8 | Changes have stayed incremental and behavior-preserving. |
