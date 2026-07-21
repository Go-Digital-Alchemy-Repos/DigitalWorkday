# Repository Governance and Engineering Standards Audit

Date: 2026-07-21
Branch: `main`

## Executive Assessment

Overall score: 7/10
Release recommendation: Approve with follow-up

Digital Workday has solid automated release gates for a production pilot, but the governance entrypoints were incomplete. CI runs `npm ci`, generates an SBOM, executes `npm run test:ci`, and uploads artifacts. The repo also has documentation policy, docs checklists, production readiness, publishing readiness, SLO, and supply-chain gates. The main gaps were repository-level contributor guidance, PR review structure, and an explicit ownership map for risky areas.

Strongest aspects:

- `.github/workflows/ci.yml` verifies pull requests and pushes to `main` with pinned Node/npm, `npm ci`, SBOM generation, `npm run test:ci`, and artifacts.
- `script/supply-chain-check.mjs` blocks alternate lockfiles, non-registry package specs/resolutions, missing package integrity, unexpected install scripts, and dev-only runtime packages.
- Route-policy and tenancy tests already enforce important architectural standards under `server/tests/policy/*` and route-specific tests.

Most important risks:

- No active `CODEOWNERS` file exists because stable GitHub usernames/teams are not defined in this workspace.
- Governance was spread across docs and scripts without a single contributor entrypoint.
- CI does not yet invoke `docs:check`, `governance:check`, `production:check`, or `publishing:check`; they are available local gates but not mandatory in GitHub Actions.

## System Map

Application type: authenticated multi-tenant SaaS.
Runtime and tooling: Node.js 20, npm 11.16.0, TypeScript, Vite, Express, React, Drizzle, PostgreSQL.
Deployment: Railway from `main`, with production smoke checks and readiness endpoints.
Governance surfaces inspected: `.github/workflows/ci.yml`, package scripts, documentation policy/checklist, development checklist, supply-chain script, production/publishing/docs checks, route-policy tests, README, and repo root.

## Findings

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GOV-001 | Medium | Confirmed | Repository root | No `CONTRIBUTING.md` existed before this pass. | New contributors had no single source for branch, verification, database, docs, and deploy expectations. | Added `CONTRIBUTING.md`. | S | Low |
| GOV-002 | Medium | Confirmed | `.github/` | No PR template existed before this pass. | Risky changes could be reviewed without explicit tenancy, migration, deploy, rollback, or verification prompts. | Added `.github/PULL_REQUEST_TEMPLATE.md`. | S | Low |
| GOV-003 | Medium | Confirmed | Repository governance | No active `CODEOWNERS`; no stable GitHub owner handles available locally. | GitHub cannot automatically request domain owners until teams/users are known. | Added `docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md` with review ownership by area and a clear CODEOWNERS follow-up. | S | Low |
| GOV-004 | Low | Confirmed | `package.json`, `script/repository-governance-check.cjs` | Governance entrypoints were not executable as a check. | Governance files can drift or disappear without an automated signal. | Added `npm run governance:check` and a focused test. | S | Low |
| GOV-005 | Informational | Confirmed | `.github/workflows/ci.yml` | CI runs `npm ci`, SBOM generation, `npm run test:ci`, and artifact upload. | The release backstop is strong for code/build correctness. | Consider adding governance/docs/production checks to CI after current workflow-scope push blocker is resolved. | S | Low |

## Changes Made

- Added `CONTRIBUTING.md`.
- Added `.github/PULL_REQUEST_TEMPLATE.md`.
- Added `docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md`.
- Added `script/repository-governance-check.cjs`.
- Added `server/tests/repository-governance-check.test.ts`.
- Added `governance:check` to `package.json`.

Compatibility: no runtime behavior, API contract, database schema, auth, route, deployment command, or Railway configuration changed.

## Verification Results

Commands run:

- `npm run governance:check`
- `npx vitest run server/tests/repository-governance-check.test.ts`
- `npm run docs:check`
- `npm run production:check`
- `npm run test:ci`

## Residual Risk And Roadmap

Immediate:

- Use `CONTRIBUTING.md` and the PR template for every production-bound change.
- Keep `main` as the production source of truth.
- Continue running `npm run test:ci` and `npm run production:check` before deploy.

Near term:

- Define real GitHub team/user handles and add `.github/CODEOWNERS`.
- Add `docs:check`, `governance:check`, `production:check`, and `publishing:check` to CI after the GitHub token has `workflow` scope.
- Add branch protection in GitHub requiring CI to pass before merging to `main`.

Long term:

- Add ADRs for major architectural decisions such as tenant isolation, client portal permissions, public publishing boundaries, AI governance, and Railway deployment strategy.
- Periodically audit stale legacy docs and consolidate them into the numbered docs tree.

Do not pursue now:

- Do not invent CODEOWNERS handles or teams in code.
- Do not add heavyweight process or multi-repo release machinery while this is still a focused production pilot.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| CI enforcement | 8 | Strong `test:ci`; newer local gates are not yet in workflow. |
| Contribution guidance | 8 | Added root contributor guide; adoption still needs team habit. |
| PR review structure | 8 | Added template with risk and verification prompts. |
| Ownership | 6 | Area ownership is documented, but CODEOWNERS awaits real GitHub handles. |
| Dependency policy | 8 | Supply-chain gate exists and is part of `test:ci`. |
| Documentation policy | 8 | Existing docs policy/checklists plus entrypoint checks. |
| Release ownership | 7 | Railway/source-of-truth expectations documented; branch protection is external. |
| Deprecation policy | 7 | Now documented, but not deeply automated. |

