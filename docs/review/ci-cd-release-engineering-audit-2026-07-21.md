# CI/CD and Release Engineering Audit - 2026-07-21

## Executive Assessment

Overall score: 7/10

Release recommendation: Approve with follow-up.

DigitalWorkday has strong local release gates (`npm run test:ci`), deterministic npm lockfile installation support, Railway config-as-code, deployment smoke checks, health/readiness probes, and post-deploy SLO smoke checks. The major release-engineering gap was that none of this was enforced by a committed GitHub Actions workflow, and GitHub reported `main` as unprotected. This pass adds a reproducible CI workflow and tightens migration command safety without changing application behavior.

Strongest aspects:

- `package-lock.json` is committed and `script/supply-chain-check.mjs` validates lockfile integrity, allowed install scripts, and registry-only package sources.
- `railway.toml` defines build/start commands, `/health` healthcheck, restart policy, and a pre-start deployment smoke check.
- `npm run test:ci` runs supply-chain validation, TypeScript, fast server tests, client tests, and production build.

Most important risks:

- GitHub API reported `main` as not protected, so required CI checks are not enforced at the repository policy layer yet.
- Railway deploys directly from `main`; there is no repo-level promotion artifact or canary process.
- Release provenance is basic: CI now generates an SBOM artifact, but signed provenance/attestations are not implemented.

## System Map

- Source control: GitHub repository `Go-Digital-Alchemy-Repos/DigitalWorkday`, remote `origin`.
- Branching observed: only remote `main` was present during this audit.
- CI gate: newly added GitHub Actions workflow in `.github/workflows/ci.yml`.
- Package manager: npm with committed `package-lock.json` lockfile version 3.
- Build: `npm run build` runs Vite client build and esbuild server bundle via `script/build.ts`.
- Tests: `script/run-vitest-suite.mjs` splits fast/http/db suites; `npm run test:ci` runs the release gate.
- Supply chain: `script/supply-chain-check.mjs` enforces registry tarballs, integrity metadata, and reviewed install-script packages.
- Deployment: Railway config in `railway.toml`; Railway auto-deploys from GitHub `main`.
- Runtime smoke: `server/scripts/deploy-smoke.cjs` validates env/build artifacts before app start.
- Post-deploy verification: `npm run slo:check` validates `/health`, `/readyz`, latency thresholds, and optional expected version.

Areas inspected:

- `.github` repository directory
- `package.json`
- `package-lock.json`
- `railway.toml`
- `script/build.ts`
- `script/run-vitest-suite.mjs`
- `script/supply-chain-check.mjs`
- `server/scripts/deploy-smoke.cjs`
- `server/scripts/guard-production-push.ts`
- `server/scripts/migrate.ts`
- `server/scripts/railway-smoke.ts`
- `docs/DEPLOYMENT_RAILWAY.md`
- `docs/deployment/DEPLOYMENT.md`
- `docs/RAILWAY_VERIFICATION_CHECKLIST.md`
- `docs/12-OPERATIONS/SLOS_ALERTING_INCIDENT_RESPONSE.md`
- GitHub branch protection for `main` via `gh api repos/Go-Digital-Alchemy-Repos/DigitalWorkday/branches/main/protection`

## Findings

| ID | Severity | Confidence | Location | Evidence | Why It Matters | Recommended Remediation | Effort | Risk |
|----|----------|------------|----------|----------|-----------------|-------------------------|--------|------|
| REL-001 | High | Confirmed | `.github` | `ls .github` returned no directory before remediation. | Railway deploys from GitHub, but pushes/PRs had no committed CI gate in the repo. | Add GitHub Actions workflow using `npm ci`, SBOM generation, `npm run test:ci`, and artifact retention. | S | Low |
| REL-002 | High | Confirmed | GitHub branch protection for `main` | GitHub API returned `Branch not protected` for `main`. | Required checks cannot be enforced until branch protection is enabled. Direct broken pushes to production remain possible. | Enable branch protection requiring the new `Verify` workflow before merge/push. | XS | Moderate |
| REL-003 | Medium | Confirmed | `package.json`, `server/scripts/guard-production-push.ts` | Guard script instructed operators to run `npm run db:migrate`, but `package.json` did not define it; `db:push` directly ran `drizzle-kit push`. | Under release pressure, operators could follow a missing command or accidentally run interactive schema push in CI/production. | Add `db:migrate` alias and route `db:push` through the production/CI guard. | XS | Low |
| REL-004 | Medium | Confirmed | Prior dependency audit and package scripts | SBOM could be generated manually, but no CI artifact existed. | Release investigations need a durable dependency inventory for the shipped commit. | Generate CycloneDX SBOM in CI and retain artifact for 30 days. | XS | Low |
| REL-005 | Medium | Strongly Supported | `railway.toml`, deployment docs | Railway deploys directly from `main` with health checks; no canary/promotion artifact is represented in repo config. | Direct promotion is acceptable for this pilot but limits gradual rollout and rollback confidence as usage grows. | Keep direct main deployment for now; add promotion/canary only after CI and branch protection are stable. | M | Moderate |

## Changes Made

- Added `.github/workflows/ci.yml`.
  - Runs on `pull_request`, `push` to `main`, and manual dispatch.
  - Installs the pinned `npm@11.16.0` before `npm ci`.
  - Uses `npm ci` with npm cache.
  - Generates CycloneDX SBOM.
  - Runs `npm run test:ci`.
  - Uploads SBOM and build artifacts with bounded retention.
  - Uses read-only repository permissions and concurrency cancellation.
- Updated `package.json`.
  - Added `db:migrate` alias for `server/scripts/migrate.ts`.
  - Wrapped `db:push` with `server/scripts/guard-production-push.ts`.
- Added this audit report.

Compatibility considerations:

- No runtime API, database schema, tenant permissions, or Railway config changed.
- The CI workflow is additive and does not affect local development.
- `db:push` still works in local development after the guard passes, but is blocked when `NODE_ENV=production`, `RAILWAY_ENVIRONMENT`, or `CI` is set.

## Verification Results

Initial checks:

- `git status --short --branch` - clean before remediation.
- `gh api repos/Go-Digital-Alchemy-Repos/DigitalWorkday/branches/main/protection` - returned `Branch not protected`.
- `git ls-remote --heads origin main staging develop` - only `main` returned.

Verification pending at report creation:

- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "workflow yaml parsed"'` - passed.
- `npm sbom --sbom-format=cyclonedx --json > /tmp/digitalworkday-sbom.cdx.json` - passed.
- `CI=true npm run db:push` - failed as expected with the production/CI guard message.
- `npm run supply-chain:check` - passed.
- `npm run test:ci` - supply-chain check, TypeScript, fast tests, client tests, and production build passed.
- Railway production and staging deployment verification after push.

## Second Pass

No Critical findings were identified. After remediation, the main remaining High finding is repository configuration, not code: `main` should be protected and require the new CI check. I did not enable branch protection automatically because it can immediately alter the team's shipping workflow.

The local changes are small and release-scoped: one workflow file, two package script adjustments, and documentation. No dependencies, migrations, route contracts, or runtime middleware were introduced.

## Residual Risk and Roadmap

Immediate:

- Enable branch protection on `main`.
- Require the GitHub Actions `Verify` job before merge or direct update.
- Keep Railway production and staging pinned to `main` until the team is ready for explicit promotion.

Near term:

- Add a lightweight release checklist that references the CI artifact, Railway deployment ID, `/health.version`, and `npm run slo:check`.
- Add dependency review or Dependabot policy once the GitHub Actions workflow has run successfully.
- Decide whether all production changes should go through PR review now that CI exists.

Long term:

- Add signed build provenance/attestations if releases become regulated or customer-audited.
- Consider staging-to-production promotion artifacts only after the pilot moves beyond direct owner-operated releases.
- Add canary or phased rollout when the app has enough traffic to measure canary health.

Premature:

- Do not add Kubernetes-style deployment complexity while Railway direct deploys are meeting the pilot need.
- Do not require heavy release trains until the team has multiple active contributors.
- Do not block emergency owner pushes until branch-protection bypass policy is agreed.

## Final Scorecard

- CI gate coverage: 8/10. Full local gate is now represented in GitHub Actions.
- Reproducibility: 8/10. `npm ci`, lockfile checks, and no alternate lockfiles are in place.
- Branch protection: 3/10. Confirmed absent; must be configured in GitHub.
- Deployment safety: 8/10. Railway smoke checks, health checks, and SLO checks cover the current deployment model.
- Migration safety: 8/10. `db:migrate` exists and `db:push` is guarded; production docs still deserve periodic drift checks.
- Artifact retention: 7/10. CI retains SBOM and build artifacts; signed provenance is not present.
- Rollback readiness: 7/10. Railway rollback docs exist; promotion/canary strategy remains future work.
- Overall release engineering: 7/10. Good pilot-grade pipeline after this pass, with branch protection as the key follow-up.
