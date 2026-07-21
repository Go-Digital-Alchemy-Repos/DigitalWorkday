# Dependency and Supply-Chain Security Audit - 2026-07-21

## Executive Assessment

Overall score: **8.3 / 10**

Release recommendation: **Approve with follow-up**

The repository has a healthy baseline: one npm lockfile, no known npm advisories at the time of review, registry-only resolved packages, integrity metadata across registry tarballs, no Git/URL dependencies, and no lockfile deprecation markers. The main issues were governance gaps: development-only tools were declared as production dependencies, the npm toolchain version was not pinned, install-script approvals were not recorded, and there was no repeatable local supply-chain policy check.

## System Map

Application type:

- Full-stack TypeScript/React/Express application.
- npm package manager with `package-lock.json` lockfile version 3.
- Vite client build, `tsx script/build.ts` production build, bundled server output at `dist/index.cjs`.
- Railway deployment via `railway.toml`, with `RAILPACK`, `npm run build`, and `node server/scripts/deploy-smoke.cjs && npm run start`.
- PostgreSQL persistence through Drizzle/pg.
- Session authentication with Passport, Express sessions, and tenant-aware route middleware.

Supply-chain boundary:

- Runtime dependencies are declared in `package.json`.
- Dev/build/test dependencies are required during Railway build because `.npmrc` sets `production=false`.
- `package-lock.json` is the authoritative lockfile.
- No GitHub Actions workflows were present in this checkout, so CI exposure was limited to local npm scripts and Railway config.

Areas inspected:

- `package.json`
- `package-lock.json`
- `.npmrc`
- `railway.toml`
- `server/scripts/deploy-smoke.cjs`
- npm advisory database via `npm audit`
- npm outdated metadata via `npm outdated --json`
- npm install-script approval state via `npm approve-scripts --allow-scripts-pending`
- npm SBOM generation via `npm sbom --sbom-format=cyclonedx --json`

## Findings Table

| ID | Severity | Confidence | Location | Evidence | Why it matters | Remediation | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DSC-01 | Medium | Confirmed | `package.json` dependencies | `@types/*`, `vitest`, `supertest`, and `rollup-plugin-visualizer` were under direct production dependencies | Expands the production dependency manifest and makes later `--omit=dev` deploy pruning less meaningful | Moved type/test/build-only packages to `devDependencies` | XS | Low |
| DSC-02 | Medium | Confirmed | `package.json` missing `allowScripts`; npm install output | `npm install --package-lock-only` warned about unreviewed install scripts for `bufferutil`, `esbuild`, `fsevents`, and `sharp` | Lifecycle scripts are one of the highest-risk npm supply-chain surfaces | Recorded pinned `allowScripts` approvals for only the reviewed install-script packages | XS | Low |
| DSC-03 | Medium | Confirmed | No existing supply-chain policy script | Before this pass, no local command failed on Git/URL dependencies, missing integrity, unexpected lifecycle scripts, or dev-only runtime dependencies | Supply-chain drift can enter through routine dependency changes | Added `npm run supply-chain:check` | S | Low |
| DSC-04 | Low | Confirmed | `package.json` missing `packageManager` | npm version was not declared | Different npm versions can produce different lockfile/install-script behavior | Added `packageManager: npm@11.16.0` matching the workstation npm used for this review | XS | Low |
| DSC-05 | Low | Strongly Supported | `.npmrc`, `railway.toml` | `.npmrc` uses `production=false`; Railway build runs `npm run build` and does not document post-build pruning | Dev dependencies must be available for build, but likely remain in the deployed image unless the platform prunes later | Do not change in this pass; test a Railway-safe post-build prune strategy separately | M | Moderate |
| DSC-06 | Informational | Confirmed | `package-lock.json` | 881 lockfile packages, 0 non-registry resolved packages, 0 missing registry integrity entries, 0 deprecated lockfile markers | Good baseline; keep it enforced | Covered by `supply-chain:check` | XS | Low |
| DSC-07 | Informational | Confirmed | npm advisory database | `npm audit --json` and `npm audit --omit=dev --json` reported 0 vulnerabilities | No advisory-driven upgrade was required in this pass | Continue audit checks in CI/deploy gates | XS | Low |
| DSC-08 | Informational | Confirmed | npm outdated metadata | Many packages have newer wanted/latest versions; examples include AWS SDK 3.1091, Radix patch releases, Tiptap 3.28, OpenAI 6.48, pg 8.22, Stripe 20.4/22.x | Staleness is not a vulnerability by itself, but large lag increases future upgrade pressure | Batch patch/minor upgrades by ecosystem with test focus, avoid major upgrades without feature regression budget | M/L | Moderate |

## Changes Made

- `package.json`
  - Added `packageManager: npm@11.16.0`.
  - Added `supply-chain:check`.
  - Moved direct development-only packages from `dependencies` to `devDependencies`.
  - Added pinned `allowScripts` approvals for reviewed lifecycle-script packages.
- `package-lock.json`
  - Refreshed with `npm install --package-lock-only` after dependency classification changes.
- `script/supply-chain-check.mjs`
  - Added a local guard for alternate lockfiles, lockfile version, disallowed Git/URL/file specs, missing integrity, unexpected install scripts, and dev-only runtime dependency declarations.

Compatibility considerations:

- Runtime application behavior is unchanged.
- Railway still installs dev dependencies during build because `.npmrc` intentionally sets `production=false` for `tsx`, Vite, and esbuild availability.
- The new check is additive and only runs when invoked.

## Verification Results

Passed:

- `npm install --package-lock-only`
- `npm approve-scripts --allow-scripts-pending`: no packages with unreviewed install scripts
- `npm run supply-chain:check`: passed
- `npm audit --json`: 0 vulnerabilities
- `npm audit --omit=dev --json`: 0 vulnerabilities
- `npm sbom --sbom-format=cyclonedx --json`: generated CycloneDX 1.5 SBOM with 693 components
- `npm run test:ci`: passed `supply-chain:check`, typecheck, fast server tests, client tests, and production build
- Lockfile inspection: 881 packages, 0 non-registry sources, 0 missing registry integrity entries, 0 deprecation markers

Important note:

- `npm ls --omit=dev` still reflects the repo-level `.npmrc production=false` behavior and is not a reliable production-direct-dependency assertion in this checkout. The manifest-level assertion now reports 98 direct runtime dependencies and 0 forbidden dev-only runtime declarations.

## Residual Risk and Roadmap

Immediate:

1. Add `npm run supply-chain:check` and `npm audit --omit=dev` to the deployment/CI gate when a CI workflow exists.
2. Keep `APP_PUBLIC_URL`, secrets, and Railway variables managed outside the repo; no secret material was found in the inspected manifests.

Near-term:

1. Test a Railway-safe post-build prune flow so dev dependencies are not retained in the runtime image.
2. Generate and archive CycloneDX SBOMs for production releases.
3. Batch low-risk patch/minor upgrades: AWS SDK, Radix, Tiptap, pg, Stripe 20.x, OpenAI 6.x, and related type packages.

Long-term:

1. Add dependency review automation for pull requests once GitHub Actions or another CI provider is configured.
2. Consider package provenance/signature workflows only after CI is stable; adopting them before a clear release pipeline would be premature.
3. Avoid major dependency upgrades such as React 19, Express 5, Vite 8, FullCalendar 7, Stripe 22, or Zod 4 without dedicated regression planning.

Recommendations not to pursue now:

- Do not set `ignore-scripts=true`; this repo legitimately needs native/build packages such as `sharp`, `esbuild`, and optional `bufferutil`.
- Do not remove `.npmrc production=false` until Railway build behavior is tested with an alternative install/build/prune plan.
- Do not chase every `npm outdated` entry in one batch; the blast radius would be larger than the current risk.

## Final Scorecard

| Dimension | Score | Deduction |
| --- | ---: | --- |
| Known vulnerability posture | 10 | npm audit reported 0 vulnerabilities |
| Lockfile integrity | 10 | Single v3 lockfile, registry-only tarballs, no missing integrity |
| Dependency classification | 8 | Improved in this pass; still many broad runtime dependencies to review later |
| Install script governance | 8 | Approved pinned lifecycle scripts and added guard; npm policy remains advisory in this npm version |
| SBOM readiness | 8 | npm can generate CycloneDX; release archival is not yet automated |
| CI/deploy enforcement | 6 | Local script exists, but no CI workflow was found and Railway gate does not yet call it |
| Upgrade hygiene | 7 | No urgent advisories, but several ecosystems are behind patch/minor latest versions |
| Runtime image minimization | 6 | Build needs dev dependencies and post-build pruning is not yet validated |

Final recommendation: **Approve with follow-up**.
