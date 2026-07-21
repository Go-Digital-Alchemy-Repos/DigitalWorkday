# Contributing

Digital Workday is a production pilot, so changes should be small, verified, and explicit about tenancy, security, data, and deployment effects.

## Standard Workflow

1. Start from an up-to-date `main`.
2. Use a focused branch for each coherent change.
3. Keep commits scoped to the feature, fix, or review pass.
4. Add or update tests for meaningful behavior changes.
5. Update documentation when setup, environment variables, public routes, API contracts, permissions, or release behavior changes.
6. Run the relevant local gates before asking for review.

## Required Local Gates

Run the narrowest relevant gate while iterating, then run the full release gate before merge or deploy:

```bash
npm run check
npm test
npm run test:client
npm run docs:check
npm run governance:check
npm run production:check
npm run test:ci
npm run release:check
```

Run additional gates when the change touches those areas:

```bash
npm run test:http
npm run test:db
npm run publishing:check
npm run slo:check
npm run supply-chain:check
```

`test:db` requires a configured test `DATABASE_URL`. Do not point DB tests at production.

## Risk Areas

Use extra care and call out reviewers when touching:

- Authentication, sessions, invite acceptance, password reset, or Google OAuth.
- Tenant context, effective tenant selection, super-admin act-as-tenant flows, or route policies.
- Client portal access, customer comments/visibility, documents, default docs, or portal invitations.
- Database schema, migrations, production startup, deploy smoke, Railway config, or destructive operations.
- File storage, presigned URLs, upload validation, R2 config, or public/crawler routes.
- AI configuration, prompts, model allowlists, or LLM output parsing.
- CI, supply-chain checks, dependency versions, or lockfiles.

## Database Changes

- Prefer migrations for shared, staging, and production environments.
- Use `npm run db:push` only for local development and only through the existing guard.
- Include rollback notes for schema or data migrations.
- Verify tenant-owned tables include tenant isolation where applicable.

## Documentation Changes

- Keep `README.md` and `docs/README.md` as reliable entrypoints.
- Run `npm run docs:check` when editing either entrypoint.
- Update `docs/ENVIRONMENT_VARIABLES.md` and `.env.example` when adding runtime configuration.
- Update API registry or functional docs when changing public/internal contracts.

## Release And Deploy

`main` is the production source of truth. Railway deploys from pushed commits. Before a production deploy, verify:

- `npm run release:check`
- Any domain-specific gate for the changed area
- Railway variables and deploy smoke requirements for runtime changes

GitHub pushes that modify `.github/workflows/*` require a token with `workflow` scope.
