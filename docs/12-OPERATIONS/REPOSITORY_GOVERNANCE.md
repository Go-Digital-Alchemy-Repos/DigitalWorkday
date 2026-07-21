# Repository Governance

Digital Workday's governance model is intentionally lightweight for the current production pilot. The repository relies on clear contribution rules, explicit release gates, focused documentation, and extra review for high-risk areas.

## Source Of Truth

- `main` is the production source of truth.
- Railway production and staging should deploy commits from the same source branch unless a temporary incident branch is explicitly documented.
- Local commits are not considered deployable until pushed and verified by CI/Railway.

## Required Gates

Default local gates:

- `npm run check`
- `npm test`
- `npm run test:client`
- `npm run docs:check`
- `npm run governance:check`
- `npm run production:check`
- `npm run test:ci`

Area-specific gates:

- `npm run test:http` for Express route, middleware, auth, and API contract changes.
- `npm run test:db` for database behavior; requires a non-production `DATABASE_URL`.
- `npm run publishing:check` for public routes, crawler metadata, docs viewer, and document publishing-adjacent changes.
- `npm run slo:check` after staging or production deploys.
- `npm run supply-chain:check` for dependency, lockfile, install script, or package manager changes.

## Review Ownership By Area

No GitHub `CODEOWNERS` file is active yet because this workspace does not currently define stable GitHub usernames or teams for each owner. Until those handles exist, use the ownership map below in PR review and handoff notes.

| Area | Primary review concern |
| --- | --- |
| `server/auth.ts`, `server/middleware/`, `server/http/policy/` | Auth, session safety, route policy, tenant context |
| `server/http/domains/`, `server/features/`, `server/routes/` | API contracts, tenancy, permissions, error behavior |
| `shared/schema.ts`, `migrations/`, `server/scripts/migrate.ts` | Schema compatibility, migration safety, rollback |
| `client/src/pages/`, `client/src/components/`, `client/src/lib/queryClient.ts` | User workflows, React Query keys, accessibility, polish |
| `server/services/uploads/`, `server/s3.ts`, `server/http/domains/*documents*` | File isolation, upload validation, presigned URL safety |
| `.github/`, `Dockerfile`, `railway.toml`, `server/scripts/deploy-smoke.cjs` | CI, deploy safety, Railway runtime |
| `docs/`, `README.md`, `.env.example` | Developer onboarding, operational accuracy |
| `server/services/ai/`, `server/http/domains/ai.router.ts` | AI governance, model allowlists, prompt/data exposure |

When GitHub owners are known, add a real `.github/CODEOWNERS` file with those handles and update this document.

## Branch And Release Policy

- Use focused branches for normal work.
- Keep unrelated refactors out of bug-fix branches.
- Do not bypass CI for production changes.
- Do not push `.github/workflows/*` changes with a token that lacks `workflow` scope; GitHub rejects those updates.
- Document staging and production verification results in the PR, commit handoff, or deployment notes.

## Dependency Policy

- Use npm with `package-lock.json`; do not add alternate lockfiles.
- Registry dependencies must resolve from `https://registry.npmjs.org/` with integrity metadata.
- Runtime dependencies must not include test-only packages.
- New install scripts require explicit review and `script/supply-chain-check.mjs` updates.

## Deprecation Policy

- Keep deprecated routes or modules behind explicit compatibility notes.
- Prefer migration guides or adapters over silent removal of public/internal contracts.
- Remove deprecated code only after confirming no active route, UI, test, or Railway path depends on it.

## Automation

The static repository governance check verifies that the key governance entrypoints, PR template, CI workflow, and package scripts remain present:

```bash
npm run governance:check
```

